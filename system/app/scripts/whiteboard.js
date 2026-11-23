function setZoom(n, x, y) { if(window.appSetZoom) window.appSetZoom(n, x, y); }

function toast(msg) { if(window.appToast) window.appToast(msg); }



function render() { if(window.appRender) window.appRender(); }



var wbWrap = document.getElementById('whiteboardWrap');

var wb = document.getElementById('whiteboard');

var _lastMeasureMapId = null;

/* ---- token stance: elevation (yards) + posture ----
   Two VTT features (Settings ▸ This campaign, set per campaign — camp.vtt — and on from the
   first launch) decide whether the chips draw and whether the blast template measures in 3D.
   The values stay on the token either way, so switching a feature back on restores them.
   In a session the GM's campaign settings are the ceiling for the player copy: they arrive
   with the snapshot and again whenever the GM flips one, and a player may switch a feature
   off for themselves on top. stanceOn delegates to the one gate, window.wpVtt.on (vtt.js). */
// The postures are the system's own list (systemcore postureList): a system with none has posture switched off (1.6.0, backlog 183 (3)).
// [fogcheck:ground-start]
// Item 19b H5 (the owner's answer of 2026-10-01, "Added": ground height): a token's height is its own elevation — what its player or the GM
// set, "above the ground you stand on" — plus the ground under it: the highest Ground height (item.ground, yards, below 0 for a pit) of the
// map's pieces whose outline covers the center of the token's cell (fogcore groundAt: the cells the cover readers use). Given the map, every
// reader of a height reads the sum through this one function — the chip and the hover card, cover, the ruler's 3D line, a blast, HeightDiff
// and HeightMod, the fog rules; without a map, the token's own elevation as ever (what the stance rows show and set). shown (true): only the
// pieces players hold, never one the GM hid — for what a host works out for its players (their roll, a thrown blast's height); a player's own
// copy holds no hidden piece, so their app reads the ground from what it has
function tokenElevation(it, map, shown) { var e = Number(it && it.elevation); e = isFinite(e) ? e : 0; return map ? Math.round((e + tokenGround(it, map, shown)) * 100) / 100 : e; }
function tokenGround(it, map, shown) { return it && typeof it === 'object' ? groundAt(map, it.x + (it.w || 60) / 2, it.y + (it.h || 52) / 2, shown) : 0; }   // the ground under a token's center
function groundAt(map, x, y, shown) {   // the ground under a board point of a map, yards (0: none, no map, no fog core)
    var C = window.wpFogCore; if (!C || !C.groundAt || !C.gridFor || !map || typeof map !== 'object' || !Array.isArray(map.whiteboard)) return 0;
    return C.groundAt(map.whiteboard, x, y, C.gridFor((map.meta && map.meta.gridType) || 'off', map.fog && map.fog.cell, map.meta && map.meta.cell), shown === true);
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
// meters — and always kept in yards, as a token's elevation is. Plain text: callers escape it
var YD_M = 0.9144;
function metricOn() { return state.measureUnit === 'metric'; }
// 1.6.2 (backlog 164 (g); the owner, by prompt: "Both ways"): a system whose own distance unit is feet (its Combat tab's unit) shows a height in
// feet to a viewer set to Imperial; a meter system, and Metric, in meters as before. Still kept in yards
function ftOn() { if (metricOn()) return false; var s = typeof postureSys === 'function' ? postureSys() : null; return !!(s && s.combat && s.combat.unit === 'ft'); }
function lenUnit() { return metricOn() ? 'm' : ftOn() ? 'ft' : 'yd'; }
function ydOut(yd) { var v = Number(yd); if (!isFinite(v)) v = 0; return metricOn() ? v * YD_M : ftOn() ? v * 3 : v; }   // yards, as the viewer reads them
function ydIn(v) { var n = Number(v); return !isFinite(n) ? NaN : metricOn() ? n / YD_M : ftOn() ? n / 3 : n; }   // what the viewer typed, in yards
function fmtLen(yd) { return String(Math.round(ydOut(yd) * 10) / 10) + ' ' + lenUnit(); }
function fmtElev(e) { e = ydOut(e); return (e > 0 ? '+' : e < 0 ? '\u2212' : '') + (Math.round(Math.abs(e) * 10) / 10); }   // signed, in the viewer's unit (the caller adds lenUnit())
// A height box and its step (the read-only check of 2026-10-17: in Metric a step was one meter, 1.1 yd, so a height of whole yards, which is
// what Height clears low cover counts, was lost at the first press). A step is one yard in both, shown as 0.91 m in Metric. A box shows a
// height to a tenth of a yard, or in Metric to the centimeter, so what it shows comes back as the very tenth of a yard it was. A box with
// arrows of its own steps from the figure it shows, so that figure is its step base too (boxHeight). Numbers and plain text
function ydBox(yd) { var v = ydOut(yd); return metricOn() ? Math.round(v * 100) / 100 : Math.round(v * 10) / 10; }
function ydStep() { return metricOn() ? YD_M : ftOn() ? 3 : 1; }
function stepWords(d) { return (d < 0 ? 'Down' : 'Up') + ' one yard' + (metricOn() ? ' (0.91 m)' : ftOn() ? ' (3 ft)' : ''); }
function boxHeight(box, yd) { if (!box) return; var s = String(ydBox(yd)); box.step = String(ydStep()); box.defaultValue = s; box.value = s; }
// [systemcheck:lenunit-end]
// [systemcheck:postranged-start]
// A posture's ranged note (1.6.0, backlog 183 (3), the owner by prompt: "A ranged note per posture (Recommended)"): what a foe's RANGED roll
// against a token in it takes, a whole number the system gives each posture of its own list (its Combat tab), none by default. Display only,
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
    if (typeof tokMarksSync === 'function') tokMarksSync(el, item);   // 1.6.3: the chips just drawn take their place among the marks that fold
}
// ... and the chips of every character token on the map on screen, again (window.wpStanceChips): nothing while the data map is on screen, with
// no map, or for a token with no element on the board
function refreshStanceChips() {
    var map = getActiveMap(); if (!map || map.type !== 'map' || !Array.isArray(map.whiteboard) || state.viewMode !== 'visual' || !state.wbEls) return;
    map.whiteboard.forEach(function(w) { if (!w || !w.isChar || typeof w.id !== 'string') return; var el = Object.prototype.hasOwnProperty.call(state.wbEls, w.id) ? state.wbEls[w.id] : null; if (el) stanceChipsSync(el, w, map); });
}
window.wpStanceChips = refreshStanceChips;
// [fogcheck:stancechips-end]
// [lookcheck:tokmarks-start]
// 1.6.3 (Fulllion, 2026-11-20: "stuff like this makes the game difficult to parse at a distance", by prompt "as a setting. full marks only near the
// pointer, or when zoomed in by default"; and "without eliminating the marks explaining what they do"). Token marks on my map, in Settings
// (settings.js tokMarksApply, tokMarksZoom). Every mark keeps its own words: what is put away is said by one dot (Near the pointer or zoomed in) or one
// +N chip (Always), whose tooltip names every mark. TOKMK_SHOWN is how many marks Always shows before the rest fold.
// tokMarkFold is pure: it is handed the marks in their order, each { w: its words, a list (an effect icon that stands for several effects has
// several) }, and answers which of them fold (each mark's place, by the words it holds before it: a mark whose first words come after the first
// TOKMK_SHOWN folds) and how many words fold, the +N. tokMarkWords is the tooltip: every mark's words and then the extra words (the sense line, which
// the fog draws), each once, in order
var TOKMK_SHOWN = 3;
function tokMarkFold(marks, shown) {
    var at = 0, out = [], more = 0; shown = typeof shown === 'number' && shown >= 0 ? shown : TOKMK_SHOWN;
    (Array.isArray(marks) ? marks : []).forEach(function(m) { var n = m && Array.isArray(m.w) ? m.w.length : 0; var x = at >= shown; out.push(x); if (x) more += n; at += n; });
    return { fold: out, more: more, total: at };
}
function tokMarkWords(marks, extra) {
    var seen = Object.create(null), out = [];
    (Array.isArray(marks) ? marks : []).forEach(function(m) { (m && Array.isArray(m.w) ? m.w : []).forEach(function(t) { if (typeof t === 'string' && t && !seen[t]) { seen[t] = 1; out.push(t); } }); });
    (Array.isArray(extra) ? extra : []).forEach(function(t) { if (typeof t === 'string' && t && !seen[t]) { seen[t] = 1; out.push(t); } });
    return out.join(', ');
}
// The sense line's words as the hover card and the tooltip say them: Blind first, said as what it means, then what still works, and a sense that
// fails here as it is
function senseSays(text) {
    if (typeof text !== 'string' || !text) return [];
    var parts = text.split(' \u00b7 '), out = [];
    if (parts[0] === 'Blind') { out.push('Blind: sees only its own cell'); parts.shift(); var still = parts.filter(function(p) { return !/ fails? here$/.test(p); }); if (still.length) out.push('Still senses ' + still.join(', ')); parts = parts.filter(function(p) { return / fails? here$/.test(p); }); }
    return out.concat(parts);
}
// A token's marks on the board in the order they keep under Always: Down or Dead, who targets it, its effects, the environment badge, its posture and
// its elevation. Each is { n: its element, w: its words } read from what the board drew (each mark's own tooltip or the hover card's words), so the
// fold never names a mark the board did not draw. Called by the board's redraw after the marks are drawn, and by stanceChipsSync, which a move with no
// redraw asks for again. Writes each mark's class mk-x and the one dot or chip, tok-more, and nothing else
function tokMarkNodes(el) {
    var out = [], q = function(s) { return el.querySelector(':scope > ' + s); };
    var st = q('.token-status'); if (st) out.push({ n: st, w: [st.dataset && st.dataset.s === 'dead' ? 'Dead' : 'Down'] });
    var tm = q('.target-marks'), says = tm && Array.isArray(tm._says) ? tm._says : [];
    if (tm) Array.prototype.forEach.call(tm.children, function(ch, i) { out.push({ n: ch, w: [says[i] || 'Targeted'] }); });
    var row = el.querySelector(':scope > .token-fx > .tfx-row'), names = row ? String(row.getAttribute('title') || '').split(' \u00b7 ').filter(Boolean) : [];
    if (row) Array.prototype.forEach.call(row.children, function(ch, i) { var more = ch.classList && ch.classList.contains('more'); out.push({ n: ch, w: more ? names.slice(i) : [names[i] || 'An effect'] }); });
    var env = q('.token-env'); if (env) out.push({ n: env, w: [env.getAttribute('title') || 'Its surroundings'] });
    var sc = q('.token-stance'); if (sc) Array.prototype.forEach.call(sc.children, function(ch) { var t = String(ch.getAttribute('title') || '').split('\n')[0]; out.push({ n: ch, w: [t ? (ch.classList.contains('post') ? 'Posture: ' + t : t) : ch.textContent] }); });
    return out;
}
function tokMarksSync(el, item) {
    if (!el || !el.querySelector) return;
    var nodes = item && item.isChar ? tokMarkNodes(el) : [], sense = item && item.isChar && window.wpFog && window.wpFog.senseWordsOf ? senseSays(window.wpFog.senseWordsOf(item.id)) : [];
    var f = tokMarkFold(nodes, TOKMK_SHOWN), words = tokMarkWords(nodes, sense), more = el.querySelector(':scope > .tok-more');
    nodes.forEach(function(m, i) { if (m.n.classList.contains('mk-x') !== f.fold[i]) m.n.classList.toggle('mk-x', f.fold[i]); });
    if (!words) { if (more) more.remove(); return; }
    if (!more) { more = document.createElement('span'); more.className = 'tok-more'; el.appendChild(more); }
    var txt = f.more ? '+' + f.more : '';
    if (more.textContent !== txt) more.textContent = txt;
    if (more.getAttribute('title') !== words) { more.setAttribute('title', words); more.setAttribute('aria-label', words); }
}
// [lookcheck:tokmarks-end]

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
    if (n.paused || n.selfPaused || n.selfHeld || n.reconnecting || tok.ownerId !== n.myId || tok.locked || tok.hidden || !(tok.isChar || tok.waiting)) return null;
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
        b.addEventListener('click', function(ce) { ce.stopPropagation(); var ts = live(); if (ts) setYd(tokenElevation(ts[0]) + parseInt(b.dataset.d, 10)); });   // 1.5.4: one yard in Metric too, where it was one meter (1.1 yd)
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
    var rows = tok.locked ? (stanceOn('elevation') || stanceOn('posture') ? '<div class="menu-divider"></div><div class="menu-item" style="color:var(--dim); cursor:default;"><i class="wib wi-anchor"></i> Locked by the GM</div>' : '') : (stanceMenuHtml(tok) || '');   // a locked token is frozen for its player
    var sheetRow = tok.charId && window.wpSheets && window.wpSheets.canOpen(tok.charId) ? '<div class="menu-item cm-sheet-own"><i class="wib wi-clip"></i> Sheet&hellip;</div>' : '';
    var hudRow = tok.charId && window.wpSheets && window.wpSheets.hudFor && window.wpSheets.hudFor(tok.charId) ? '<div class="menu-item cm-hud-own"><i class="wib wi-hud"></i> HUD&hellip;</div>' : '';   // HUD frame (HF2b)
    var picRow = ownPicOk(tok) ? '<div class="menu-item cm-pic-own"><i class="wib wi-pic"></i> New picture&hellip;</div>' : '';   // the token creator: their own picture, framed
    var fxRow = window.wpSheets && window.wpSheets.tokenFxModel && window.wpSheets.tokenFxModel(tok) ? '<div class="menu-item cm-fx-own"><i class="wib wi-spark"></i> Effects&hellip;</div>' : '';   // conditions C2: where their sheet lets them
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
    if (tok.lightLock === true) return '<div class="menu-item" style="color:var(--dim); cursor:default;"><i class="wib wi-lock"></i> Light locked by the GM</div>';
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
    c = cssColor(c);   // a color from a file could be url(…) or a second property: none
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
// Backlog 181: the picture a piece of the map would show as a scene: a picture's own, or a character token's, as the app's own path
// (picRef: never a web address); a character's portrait where its token wears none. '' for anything else
function sceneSrcOf(w) {
    if (!w || typeof w !== 'object' || w.type !== 'image' || w.waiting) return '';
    if (typeof w.src === 'string' && picRef(w.src) && !/^(data:|blob:)/.test(w.src)) return w.src;
    var camp = w.isChar && w.charId ? getActiveCampaign() : null, ch = camp && camp.chars && Object.prototype.hasOwnProperty.call(camp.chars, w.charId) ? camp.chars[w.charId] : null;
    return ch && typeof ch.portrait === 'string' && picRef(ch.portrait) && !/^(data:|blob:)/.test(ch.portrait) ? ch.portrait : '';
}
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
    var out = { src: src, url: url, tile: FC.cleanTexTile(item.texTile) || 1, box: box }, cell = wbPicCell(FC);
    if (cell) out.cell = cell;   // 1.6.2 (backlog 38): one repeat a cell of the map's own lattice, from its origin
    return out;
}
// The map on screen's own cell as a picture's repeat reads it ({ u, ox, oy }: a square's side, a hex row's 50/52, as today's 50 is to 52), or null
function wbPicCell(FC) {
    var map = typeof getActiveMap === 'function' ? getActiveMap() : null, g = map && map.meta ? map.meta.gridType : null;
    if ((g !== 'square' && g !== 'hex') || typeof FC.cleanMapCell !== 'function') return null;
    var c = FC.cleanMapCell(map.meta.cell, g); if (!c) return null;
    return { u: g === 'hex' ? c.size * 50 / 52 : c.size, ox: c.ox || 0, oy: c.oy || 0 };
}
function wbPicCellKey(pf) { return pf.cell ? '|' + pf.cell.u + ',' + pf.cell.ox + ',' + pf.cell.oy : ''; }
// A short text that stands for a resolved address in a key: the address itself when it is short, else its length and both its ends. On a
// player's app an SVG picture's address is the whole picture inline, which may be millions of characters
function wbPicUrlKey(u) { return u.length <= 256 ? u : u.length + '|' + u.slice(0, 64) + u.slice(-64); }
// A filled region's picture: an svg pattern in the path's own defs (buildcore picPattern), built again only when its picture, its tile, its
// place, its size or its color changes. True when the region wears its picture
function wbPicPath(svg, pathEl, item, bw, bh, col) {
    var pf = wbPicFill(item), BC = window.wpBuildCore; if (!pf || pf.box || !svg || !pathEl) return false;
    var key = 'pic|' + pf.src + '|' + pf.tile + wbPicCellKey(pf) + '|' + item.x + '|' + item.y + '|' + (item.w || 0) + '|' + (item.h || 0) + '|' + bw + '|' + bh + '|' + col + '|' + wbPicUrlKey(pf.url), defs = svg.querySelector(':scope > defs');
    if (!defs || svg.dataset.texKey !== key) {
        if (defs) defs.remove();
        var pat = BC.picPattern(document, pf.url, pf.tile, item.x, item.y, item.w || bw, item.h || bh, col, ++_texSerial, pf.cell);
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
// [view:helpers-start]
// 1.6.2 (backlog 82b, fold 1; the owner, 2026-11-07, by prompt: "In folds, starting now"): a pointer read on a map, in board pixels. Every reading
// goes through these, so a view that turns has one place to undo its turn (window.wpView, the view module). cx, cy: the pointer on screen; r: the
// wrap's box; w: the wrap that scrolls. Unturned they give exactly what the reading always gave. A drag's step goes through wbDX / wbDY
function wbX(cx, cy, r, w) { var V = typeof window !== 'undefined' ? window.wpView : null; return V && V.turned && V.turned(w) ? V.bx(cx, cy, r, w) : (cx - r.left + w.scrollLeft) / state.zoomLevel; }
function wbY(cx, cy, r, w) { var V = typeof window !== 'undefined' ? window.wpView : null; return V && V.turned && V.turned(w) ? V.by(cx, cy, r, w) : (cy - r.top + w.scrollTop) / state.zoomLevel; }
function wbDX(dx, dy) { var V = typeof window !== 'undefined' ? window.wpView : null; return V && V.turned && V.turned() ? V.dx(dx, dy) : dx / state.zoomLevel; }
function wbDY(dx, dy) { var V = typeof window !== 'undefined' ? window.wpView : null; return V && V.turned && V.turned() ? V.dy(dx, dy) : dy / state.zoomLevel; }
// [view:helpers-end]

import { uid, clone, createNewCampaign, createNewMap, createNewPlanner, getActiveCampaign, getActiveMap, findLandingRoom, characterList, locateCharacter, applyMapStart } from './models.js';

import { load, updateUndoBtn, pushHistory, undo, redo, save, download, getBase64Image, pressHold } from './io.js';

import { updateCampaignSelect, updateSidebarNav, navigateToMap } from './sidebar.js';

import { showPrompt, showConfirm, isCampaignNameTaken, getUniqueCampaignTitle, promptForCampaignName, isItemNameTaken, getUniqueItemTitle, promptForItemName } from './dialogs.js';

import { renderPlanner, renderPlannerPreview } from './planner.js';

import { renderDataMap, clearSnaps, drawSnap, doSmartSnapping, attachDrag, attachPanning, isLinkMode, setLinkMode, removeLinkAt, snapToHex, getSnapCoords } from './datamap.js';

import { getRoomInspectorHtml, attachRoomInspectorEvents, renderInspector,  renderElementList, esc } from './inspector.js';

import { cssColor, picRef } from './safecore.js';
import { flatAnchor, flatKids, flatRemap } from './flatten.js';   // 1.6.3 (finding 16): where a flattened picture stands when first drawn, so its pieces can follow it; a duplicate of one carries its pieces (the review of 87d9b6e0)
import { delWb, delRooms, delSaid } from './delask.js';   // 1.6.3 (findings 15 and 16): Delete asks first where it takes locked structure, a token, a room or a flattened picture's pieces
import * as TagCore from './imgtagcore.js';   // 1.6.0 backlog 34: the Image Library's tags, cleaned and drawn as text   // a map from a file: colors that are colors, pictures that are the app's own
import { wbBuild } from './wbbuild.js';   // [split:glue]
import { wbGen } from './wbgen.js';   // [split:glue]
import { wbBlast } from './wbblast.js';   // [split:glue]
import { wbImgLib } from './wbimglib.js';   // [split:glue]
export { TagCore, _castOrder, _castSel, _imgLibPick, castBatch, castLibraryHtml, castOf, castPlace, castSelSet, cssColor, furnDropAt, groundPic, groupPlace, groupsLibraryHtml, imgLibPickSet, load, picRef, setCastBatch, showPrompt };   // [split:glue]
export { _el_measureMenu, blasts, blastsSet, boxHeight, buildKey, coneAim, coneAimSet, distToSegSq, doorNearSync, esc, fmtElev, groundAt, hostGestureEnd, hostGestureStart, lenUnit, litViewer, mapMeasureConfig, measures, renderMeasures, snapToHex, stanceOn, tokenElevation, ydIn, ydOut };   // [split:glue]
export { BUILD_MAX, applyMapStart, buildAsking, buildCore, buildHere, buildMay, buildWallItem, createNewMap, genPreviewDraw, getUniqueItemTitle, navigateToMap, structLaid, undo, viewCentre };   // [split:glue]
export { armPlacement, cellSnap, closeDrawMenu, disarmPlacement, getActiveCampaign, getActiveMap, newOpacityProps, playerScreen, render, save, showConfirm, state, texListKeys, texListPick, texOptionsInto, texTileOf, tileRowSync, tileRowWire, toast, uid, updateWbToolbar, wb, wbWrap, wbX, wbY, wireTool, withAlpha };   // [split:glue]



  var _texSerial = 0;   // the map builder: one id for each svg pattern a filled region's texture takes (never an item's id)
  function renderWhiteboard() {
      if (window.wpRenderPartyStrip) window.wpRenderPartyStrip();
      if (window.wpRenderCombatStrip) window.wpRenderCombatStrip();
      if (window.wpEnvTool && window.wpEnvTool.draw) window.wpEnvTool.draw();   // 1.6.0: the Environment tool's layer, while it is in hand
      if (window.wpFogRedraw) window.wpFogRedraw();   // keep the fog overlay live whenever a fog map is on screen (any tool, during drags)
      if (typeof buildStructSync === 'function') { var _bm = document.getElementById('buildMenu'); if (_bm && _bm.style.display !== 'none' && _bm.offsetParent !== null) buildStructSync(); }   // backlog 231: Build's structure row follows a lay, an Undo and another map
      if (window.wpFillMenuSync) window.wpFillMenuSync();   // 1.6.2 (backlog 57): the Fill options, while they are up, follow the campaign and its kinds of terrain

      var activeMap = getActiveMap();

      if(!activeMap || !activeMap.whiteboard) return;

      // Restore this map's saved grid choice

      var mapGrid = (activeMap.meta && activeMap.meta.gridType) || 'off';

      var ovG = document.getElementById('gridOverlay');
      if (mapGrid !== state.gridType || (ovG && (ovG.dataset.cellSig || '') !== gridCellSig(activeMap, mapGrid))) applyGridType(mapGrid);   // backlog 38: a map's own cell draws its grid again too
      if (typeof cellLabelsSync === 'function') cellLabelsSync();   // backlog 34: the Grid menu's Cell labels and the labels themselves follow the map on screen

      // Placed rulers are per-scene: clear them when the map changes

      if (activeMap.id !== _lastMeasureMapId) {

          var _blastsFrom = _lastMeasureMapId;
          _lastMeasureMapId = activeMap.id;
          if (typeof buildPolyEnd === 'function') buildPolyEnd();   // the map builder: a polygon under way was the other map's

          if (typeof clearMeasures === 'function') clearMeasures();
          if (typeof blastsMapSwitch === 'function') blastsMapSwitch(_blastsFrom, activeMap.id);   // 1.6.3 (the review, finding 6): the blasts of the map left are kept for it, never cleared for the table

      }



      var seen = {};

      var selItem = null;
      var rnPlaces = typeof roomNamePlaces === 'function' ? roomNamePlaces(activeMap) : null;   // 1.6.2 (backlog 45, fold 3): which pieces wear a room's name, once a draw
      // 1.6.3 (the improvement week's review, finding 35): the ids of the map's flattened pictures, gathered once a draw. The loop below asks it of each
      // piece drawn into one (flatIn), where it used to search the whole map for that piece's picture: flattened pieces times all pieces on every redraw.
      // A map with no prototype, so an id such as __proto__ is an id like any other; the same answer as the search, since only a flatPic of true counts
      var flatPics = Object.create(null);
      activeMap.whiteboard.forEach(function(f) { if (f && f.flatPic === true && typeof f.id === 'string') { flatPics[f.id] = 1; if (typeof flatAnchor === 'function' && typeof window.wpCanPersistLocal === 'function' && window.wpCanPersistLocal() === true) flatAnchor(f); } });   // 1.6.3 (finding 16): a picture flattened before 1.6.3 notes where it stands before anyone can move it (flatten.js flatFollow); only on the machine that owns the campaign

      activeMap.whiteboard.forEach(function(item) {

          seen[item.id] = 1;

          var el = state.wbEls[item.id];
          if (el && el.dataset.type && el.dataset.type !== item.type) {
              // Same id, different kind of item — a player's gray placeholder (a locked rect)
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

                  // [placescheck:dbltravel-start]
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

                              // 1.6.3 (the review, finding 4): a way to another map under the fog is no way the player can see, so a double-click there asks
                              // nothing (fog.js pieceSeen, the rule the minimap and the hover card read)
                              if (window.wpFog && typeof window.wpFog.pieceSeen === 'function' && !window.wpFog.pieceSeen(_am, wItem)) return;
                              if (!wItem.hidden) { window.wpNet.requestTravel(wItem.id); if (wItem.portalLock !== true && portalNearMine(_am, wItem)) toast('Traveling...'); }   // a portal locked for players, or one no token of theirs stands next to (1.6.3, finding 2): the request still goes (the host is the judge, and its answer says why), without the promise

                              return;

                          }

                          var srcForLand = (wItem.nodeId && r.id) ? r : { id: null, name: wItem.name, targetRoomId: wItem.targetRoomId };
                          var landW = findLandingRoom(srcForLand, getActiveCampaign().items[r.targetMapId]);
                          if (navigateToMap(r.targetMapId, landW && landW.id)) toast(landW ? 'Traveled to ' + (landW.name || 'the linked room') + '.' : 'Traveled to linked map.');

                      }

                  });
                  // [placescheck:dbltravel-end]

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

              

              // [placescheck:hovercard-start]
              el.addEventListener('pointerenter', function(e) {

                  if (!item.isChar && tokCardUp()) { _tc.next = { el: el, x: e.clientX, y: e.clientY }; return; }   // backlog 236: a token's card stays through its grace; this piece shows its own once it has gone
                  cardAside(el, document.elementFromPoint ? document.elementFromPoint(e.clientX, e.clientY) : null);   // entered on a bar's arc: its own tooltip alone
                  var _am = getActiveMap(); if (!_am) return; var wItem = _am.whiteboard.find(x => x.id === item.id);

                  if(!wItem) return;

                  // no info leaks from hidden items on the player side

                  if (wItem.hidden && window.wpNet && window.wpNet.active && window.wpNet.role === 'client') return;
                  // 1.6.3 (the review, finding 4): nor from a piece under the fog. The fog's canvas takes no pointer, so a player sweeping the black
                  // ground found rooms, ways to other maps and their names by their cards; a piece they have not seen or do not remember shows none
                  // (fog.js pieceSeen: true on the GM's screen and wherever fog does not apply). A token is not judged here: the host sends only those seen
                  if (!wItem.isChar && window.wpNet && window.wpNet.active && window.wpNet.role === 'client' && window.wpFog && typeof window.wpFog.pieceSeen === 'function' && !window.wpFog.pieceSeen(_am, wItem)) return;

                  

                  var tt = document.getElementById('wbTooltip');

                  

                  if (wItem.isChar) { tokCardPut(tt, wItem, el, _am); return; }   // backlog 236: a token's card, in parts, beside the token (tokCardFor)

                  

                  if (wItem.type === 'trigger' && !wItem.nodeId) {
                      // a trigger zone is GM prep: its card shows the name and the message it fires; players get nothing
                      if (window.wpNet && window.wpNet.active && window.wpNet.role === 'client') return;
                      tt.innerHTML = '<div class="room" style="border-left-color:var(--gold); margin:0; pointer-events:none;">' +
                                     '<div class="rn">' + esc(wItem.name || 'Trigger zone') + '</div>' +
                                     '<div class="rc" style="color:var(--ink); font-size:11px; white-space:pre-wrap; text-transform:none; letter-spacing:0;">' + esc(wItem.eventMessage || 'No event message yet \u2014 write one in Properties.') + '</div>' +
                                     '<div class="rc" style="color:var(--dim); font-size:11px; text-transform:none; letter-spacing:0;">Trigger zone \u00b7 fires when a character token is dropped here</div>' +
                                     (zoneHidMe(wItem) ? '<div class="rc" style="color:var(--steel); font-size:11px; text-transform:none; letter-spacing:0;">Players do not see this zone. Its message still comes up for them.</div>' : '') + '</div>';   // 1.6.3 (finding 8): a zone players do not see says so, in fixed words
                      if (wItem.targetMapId) portalPicFill(tt, wItem.targetMapId);   // 1.6.0: a portal drawn as a zone shows the map it leads to too
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

                  var wtW = !wItem.nodeId && !wItem.targetMapId && !(window.wpNet && window.wpNet.active && window.wpNet.role === 'client') ? wallWords(wItem, window.wpFogCore) : null;
                  if (wtW) {   // 1.6.2: what a wall is, in words: the GM's own card, as a trigger zone's is
                      tt.innerHTML = '<div class="room" style="border-left-color:var(--gold); margin:0; pointer-events:none;">' +
                                     '<div class="rn">' + esc(wtW[0]) + '</div>' +
                                     '<div class="rc" style="color:var(--dim); font-size:11px; text-transform:none; letter-spacing:0;">' + esc(wtW[1]) + '</div></div>';
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
                                     lockTipP + (lockTipP && isClientP ? '' : '<div class="rc" style="color:var(--dim); font-size:11px;">' + portalWayWords(wItem, isClientP) + '</div>') +
                                     '</div>';
                      if (destP) portalPicFill(tt, wItem.targetMapId);   // 1.6.0: a small picture of the map it leads to, beside its name
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
                  var lockTT = destTT && destTT.meta && destTT.meta.playerLock ? ' \u00b7 ' + (isClientTT ? 'closed for now' : 'locked for players') : '';
                  var destLine = destTT ? '<div class="rn" style="color:var(--gold);">\u2192 ' + esc(destTT.meta && destTT.meta.title || r.targetMapId) + (destRoomTT ? ' \u00b7 ' + esc(destRoomTT.name || '') : '') + lockTT + '</div>' : '';
                  var lockTipTT = portalLockTip(wItem, activeMap, !!isClientTT);   // a portal's own lock: a player is told it is locked in place of how to travel
                  var travelHint = r.targetMapId ? destLine + (lockTipTT && isClientTT ? '' : '<div class="rc" style="color:var(--gold)">' + portalWayWords(wItem, isClientTT) + '</div>') : '';

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

                  

                  if (destTT) portalPicFill(tt, r.targetMapId);   // 1.6.0: a small picture of the map it leads to, beside its name
                  tt.style.display = 'block';

              });
              // [placescheck:hovercard-end]

              

              el.addEventListener('pointermove', function(e) {

                  cardAside(el, e.target);
                  var tt = document.getElementById('wbTooltip');
                  if (tt.classList.contains('tc-on')) return;   // backlog 236: a token's card stands still beside its token

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

                  if (_tc.next && _tc.next.el === el) _tc.next = null;
                  if (tokCardUp()) { if (item.isChar && _tc.id === item.id) { tokTip().classList.remove('wb-aside'); tokCardLater(); } return; }   // backlog 236: the card in sight for the grace, so the pointer can reach it
                  document.getElementById('wbTooltip').style.display = 'none';
                  document.getElementById('wbTooltip').classList.remove('wb-aside');

              });

          }

          

          el.style.left = item.x + 'px';

          el.style.top = item.y + 'px';

          el.style.width = item.w + 'px';

          el.style.height = item.h + 'px';

          var z = item.z || (item.isChar ? 20 : 10);   // 1.6.0, found by hand: a token with no layer stands with the tokens, never at a picture's height

          var layerZ = { 'back': 10, 'back-mid': 15, 'middle': 20, 'front-mid': 25, 'front': 30 };

          if (item.layer && layerZ[item.layer]) z = layerZ[item.layer];
          // Drawings ride above tokens (a GM's arrows and a player's marks must stay readable),
          // and their box passes clicks through — only the stroke itself is clickable (CSS).
          if (item.type === 'path' && !item.layer) z = Math.max(z, 35);

          // Per-item exception: render above the grid overlay (z 15000). 1.6.2 (the owner): a token stands over the grid lines, and so does a drawing
          // that is no piece of the map's own (systemcore pathBack), still over the tokens as before
          var SCz = window.wpSystemCore;
          z += SCz && typeof SCz.stackLift === 'function' ? SCz.stackLift(item, z) : (item.aboveGrid ? 15100 : item.isChar || item.waiting || z > 20 ? 15020 : 0);

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
              el.style[el.dataset.tex ? 'backgroundColor' : 'background'] = (item.type === 'path' || item.type === 'image' || item.type === 'text' || item.type === 'trigger') ? 'transparent' : cssColor(item.color);   // a piece that wears a tile takes its color alone: the shorthand would wipe the tile and have it written again at every draw

          }

          // [sinkcheck:texstyle-start]
          // The map builder (fold B1): a piece's texture is a name of the app's own list (buildcore.js), drawn over its color as a repeating tile
          // seated on the board's lattice, so pieces side by side read as one surface. On a box shape that is no token. A filled region's is drawn
          // in its own svg below. Anything else (no name, a name the list lacks, another kind of piece) leaves the piece exactly as it was drawn above
          var picT = typeof wbPicFill === 'function' ? wbPicFill(item) : null, BCt = window.wpBuildCore;   // fold B3: one of the campaign's own pictures comes before any pattern
          // The picture an element already wears is known by a short key kept on it, never by reading its style back: on a player's app an SVG
          // picture's address is the whole picture inline, and a map may hold thousands of cells that wear it. Then only its place can have changed
          var picKey = picT && picT.box ? picT.src + '|' + picT.tile + (typeof wbPicCellKey === 'function' ? wbPicCellKey(picT) : '') + '|' + wbPicUrlKey(picT.url) : '', picKept = !!picKey && el.dataset.picKey === picKey && !!el.dataset.pic;
          var picBox = picKey && !picKept ? BCt.picStyle(picT.url, picT.tile, item.x, item.y, picT.cell) : null;
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
          var ICON_GLYPH = {'Stairs Up':'stairs-up','Stairs Down':'stairs-down','Door':'door','Gate':'gate','Cave':'cave','Tower':'tower','Camp':'camp'};

          if (item.targetMapId) {

              portalIcon = ICON_GLYPH[item.portalIcon] || 'door';

          } else if (item.nodeId) {

              var pRoom = activeMap.rooms.find(x => x.id === item.nodeId);

              if (pRoom && pRoom.targetMapId) {

                  portalIcon = ICON_GLYPH[pRoom.icon] || 'door';

              }

          }

          if (portalIcon) { el.dataset.portal = 'true'; el.dataset.portalIcon = portalIcon; }

          else { delete el.dataset.portal; delete el.dataset.portalIcon; }

          el.classList.toggle('gm-note', !!item.gmNoteFor);

          // GM-hidden items: the GM sees them ghosted with an eye badge; a player's app draws a gray cloud box only for the stub an older host (before 1.5.0) still sends — a current host sends nothing of a hidden item

          var clientView = window.wpNet && window.wpNet.active && window.wpNet.role === 'client';

          var hideFromMe = !!item.hidden && clientView;

          el.classList.toggle('wb-hidden-gm', !!item.hidden && !clientView);
          el.classList.toggle('wb-room-area', item.roomArea === true && !!item.nodeId && !clientView);   // 1.6.2 (backlog 45, fold 3): a room's area only the GM sees
          el.classList.toggle('wb-zone-gm', !clientView && zoneHidMe(item));   // 1.6.3 (finding 8): a trigger zone players do not see, drawn dotted in steel on the GM's screen (style.css); a player's copy never holds one
          el.classList.toggle('wb-flat-in', !clientView && typeof item.flatIn === 'string' && flatPics[item.flatIn] === 1);   // 1.6.2, found by hand: a piece drawn into a flattened picture stays out of sight and out of reach on the map, its picture showing it; Layers lists it under the picture

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
          if (typeof landArrow === 'function') landArrow(el, item, doorIt && !clientView);   // 1.6.4: the side a door lands its travelers on, on the GM's own screen

          el.classList.toggle('wb-hidden-ph', hideFromMe);
          el.classList.toggle('wb-waiting', !!item.waiting && !hideFromMe);   // Onboarding F1a: the dashed ring — never on a hidden stub (an element is reused when an item is hidden)
          if (el.dataset.waitTip && (!item.waiting || hideFromMe)) { delete el.dataset.tip; delete el.dataset.waitTip; }   // nor its tooltip
          var picShape = item.type === 'image' && item.isChar && (item.shape === 'hexagon' || item.shape === 'rect' || item.shape === 'circle') ? item.shape : '';   // grid-shaped tokens: a picture token's outline (its art cut to the cell)
          el.classList.toggle('tok-pic-hexagon', picShape === 'hexagon'); el.classList.toggle('tok-pic-rect', picShape === 'rect'); el.classList.toggle('tok-pic-circle', picShape === 'circle');

          if (hideFromMe && !el.dataset.ph) { el.innerHTML = ''; el.dataset.ph = '1'; }   // 1.6.0: an older host's stand-in holds nothing and draws nothing (style.css), no cloud

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
          el.classList.toggle('wb-msel', !!(state.selWbIds && state.selWbIds.includes(item.id) && state.selWbIds.length > 1));   // 1.6.3: one of a selection shows its token marks (Token marks on my map)
          if (state.selWbIds && state.selWbIds.includes(item.id) && state.selWbIds.length > 1) { el.style.boxShadow = '0 0 0 2px var(--gold)'; } else { el.style.boxShadow = _isPortal ? ('inset 0 0 0 4px ' + _pc) : 'none'; }   // keep the portal ring when not multi-selected

          

          // Final opacity = the item's own opacity setting combined with the
          // trigger/locked dimming (absence dimming is CSS, .wb-absent !important)
          var itemOp = (item.opacity != null && item.opacity < 1) ? item.opacity : 1;
          var _lnCore = (item.type === 'path' && item.tip !== 'fill' && typeof window !== 'undefined') ? window.wpFogCore : null;   // a pen line's opacity, width and nib are read in ONE place (fogcore), so this board, a player's board, the wire and the map's picture agree for every stored value
          if (_lnCore && typeof _lnCore.lineOpacity === 'function') itemOp = _lnCore.lineOpacity(item);

          if (item.type === 'trigger') {

              el.style.opacity = ((state.selWbIds && state.selWbIds.includes(item.id)) ? 1 : 0.5) * itemOp;

          } else {

              var _bcS = typeof window !== 'undefined' ? window.wpBuildCore : null, _lkDim = item.locked && !(_bcS && _bcS.structOk && _bcS.structOk(item));   // 231: a whole map's structure is locked, and is drawn as it is
              el.style.opacity = (_lkDim && !(state.selWbIds && state.selWbIds.includes(item.id)) ? 0.85 : 1) * itemOp;

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
                  img.addEventListener('load', function() { if (el.dataset.picGone) { delete el.dataset.picGone; el.classList.remove('pic-missing'); } fitImageBox(el.dataset.id, img); });
                  // 1.6.2 (backlog 227): a picture whose file is not here (bring your own art: a shared file keeps its places) is quiet. The
                  // frame stays as an outline, a character's token shows its initials, and nothing says an error
                  img.addEventListener('error', function() { var s = img.getAttribute('src') || ''; if (!s || /^data:/.test(s)) return; el.dataset.picGone = s; el.classList.add('pic-missing'); picGoneSoon(); });

                  el.appendChild(img);

              }

              var FUd = window.wpFurnCore, fuD = item.furn && FUd && !item.src ? FUd.cleanFurn(item.furn) : null, wantSrc = fuD ? FUd.furnSrc(fuD) : resolveImg(item.src);   // 1.6.2 (backlog 222): a furnishing is the app's own drawing, from its words, unless it has a picture of its own (a pack's, a character's portrait)

              var imEl = el.querySelector('img');

              if (imEl.getAttribute('src') !== wantSrc) imEl.src = wantSrc;
              trimDraw(el, imEl, item);   // 1.6.2 (backlog 37): a picture cut to the cells kept
              // A player's copy while the picture's bytes are still on their way (or never came): the character's
              // initials stand in, so a token is never an invisible box with a facing wedge and chips floating around it.
              if (el.dataset.picGone && el.dataset.picGone !== imEl.getAttribute('src')) { delete el.dataset.picGone; el.classList.remove('pic-missing'); }   // 1.6.2: another picture now
              var pendingPic = !!(item.isChar && ((window.wpNet && window.wpNet.ASSET_PLACEHOLDER && wantSrc === window.wpNet.ASSET_PLACEHOLDER) || el.dataset.picGone));   // 1.6.2 (backlog 227): or its file is not here
              var iniEl = el.querySelector(':scope > .token-initials');
              if (pendingPic) {
                  var iniP = String(item.charName || item.name || '?').trim().split(/\s+/).map(function(s) { return s[0] || ''; }).join('').slice(0, 2).toUpperCase() || '?';
                  if (!iniEl) { iniEl = document.createElement('span'); iniEl.className = 'token-initials tok-pending'; el.appendChild(iniEl); }
                  if (iniEl.textContent !== iniP) iniEl.textContent = iniP;
                  if (window.wpPlook) window.wpPlook.fontOn(iniEl, window.wpPlook.ofTok(item));   // 1.6.2, backlog 35: its look's font
              } else if (iniEl && iniEl.classList.contains('tok-pending')) iniEl.remove();

          } else if(item.type === 'text') {

              if(el.contentEditable !== "true") {

                  el.innerHTML = (clientView && window.wpNet && window.wpNet.sanitizeRichText) ? (window.wpNet.sanitizeRichText(item.text) || 'Text...') : (item.text || 'Text...');   // at a table someone else hosts the text is rebuilt (markup kept, nothing that runs): the wire did it once, the render does it again

                  fixEmbeddedImgs(el);

              }

          } else if (item.waiting) {
              // [sinkcheck:waitingface-start]
              // Onboarding F1a: a waiting token — the player's own face read live from the table's roster (a picture that passes safeAvatar,
              // else the silhouette on their color); it is not a character, so no initials, sheet or hover card
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
              else if (cfv && cfv.img) { var fiI = el.querySelector(':scope > img.token-face-img'); if (!fiI) { el.textContent = ''; fiI = document.createElement('img'); fiI.className = 'token-face-img'; fiI.alt = ''; fiI.draggable = false; el.appendChild(fiI); } if (fiI.getAttribute('src') !== cfv.img) fiI.src = cfv.img; el.dataset.ini = 'face'; }   // compared whole: a new color is a new picture
              // [sinkcheck:charface-tok-end]
              else {
              // Stand-in token: initials until a portrait arrives
              var ini = String(item.charName || '?').trim().split(/\s+/).map(function(s) { return s[0] || ''; }).join('').slice(0, 2).toUpperCase() || '?';
              if (el.dataset.ini !== ini || !el.querySelector(':scope > .token-initials')) { el.textContent = ''; var iniS = document.createElement('span'); iniS.className = 'token-initials'; iniS.textContent = ini; el.appendChild(iniS); el.dataset.ini = ini; }
              var iniL = el.querySelector(':scope > .token-initials'); if (iniL && window.wpPlook) window.wpPlook.fontOn(iniL, window.wpPlook.ofTok(item));   // 1.6.2, backlog 35: its look's font
              }

          } else if (item.type === 'light') {
              // Lighting (L2): a light source the GM placed — a small marker for the GM (players see its light, never the marker: CSS); dimmed while off
              var lgL = window.wpFogCore && window.wpFogCore.cleanLight ? window.wpFogCore.cleanLight(item.light) : null;
              el.classList.add('wb-light'); el.classList.toggle('off', !lgL || !!lgL.off);
              if (!(state.selWbIds && state.selWbIds.length > 1 && state.selWbIds.includes(item.id))) el.style.boxShadow = '';   // the marker's glow ring is the stylesheet's (an inline none would hide it)
              var lgG = el.querySelector(':scope > .wb-light-glyph');
              if (!lgG) { el.textContent = ''; lgG = document.createElement('span'); lgG.className = 'wb-light-glyph'; el.appendChild(lgG); }
              var lgU = lgL && lgL.unit ? lgL.unit : 'yd', lgT = 'Light source' + (lgL && lgL.name ? ' (' + lgL.name + ')' : '') + (lgL ? ': bright ' + lgL.bright + ' ' + lgU + ', dim to ' + lgL.dim + ' ' + lgU + (lgL.off ? ' (off)' : '') : ' (no light set)');
              if (el.dataset.tip !== lgT) el.dataset.tip = lgT;
          } else if (item.type === 'maplegend') {   // 1.6.3: a legend of the map's places (places.js), drawn with the lines this screen's own viewer may see
              if (window.wpPlaces && typeof window.wpPlaces.legendDraw === 'function') window.wpPlaces.legendDraw(el, item, activeMap);
          } else if (item.type === 'arrive') {   // 1.6.4: an Arrive here marker, the GM's alone (arriveDraw)
              arriveDraw(el, item);
          } else if (item.type === 'mappin') {   // 1.6.3: a place pin, the map pin on a plate and the place's name under it (places.js)
              if (window.wpPlaces && typeof window.wpPlaces.pinDraw === 'function') window.wpPlaces.pinDraw(el, item, activeMap);
          } else if(item.type === 'path') {

              // [drawshowcheck:board-start]
              var _toShow = item.toShow === true && !!window.wpFogCore && typeof window.wpFogCore.showOn === 'function' && window.wpFogCore.showOn(item);   // 1.6.2: a drawing to show: the fog's canvas draws it over the fog (fog.js showShapes)
              el.classList.toggle('wb-toshow', _toShow); el.classList.toggle('wb-fade', _toShow && item.showFor === 'fade');
              if (_toShow && item.showFor && window.wpDrawShow) window.wpDrawShow.touch();   // one that goes by itself is watched wherever it came from: a paste, an undo, a file
              if (_toShow && item.showFor === 'fade' && window.wpDrawShow) el.style.opacity = String(Number(el.style.opacity) * window.wpDrawShow.fadeOf(item));   // and one that fades on its own, as far as it has
              // [drawshowcheck:board-end]

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
              // is built again only when its place, size, name or color changes. An untextured path keeps no defs and its plain fill
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
                  if (svg.dataset.texId) { pathEl.setAttribute('fill', 'url(#' + svg.dataset.texId + ')'); if (pathEl.style.fill) pathEl.style.fill = ''; }   // a color set live on the path would hide the pattern
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
              var plateFill = cssColor(item.color); if (plateEl.firstChild.style.fill !== plateFill) plateEl.firstChild.style.fill = plateFill;   // a color the rule refuses: the plate's own
              if (item.waiting) { if (!ringEl) { ringEl = hexSvg('tok-ring'); el.appendChild(ringEl); } }
              else if (ringEl) ringEl.remove();
          } else { if (plateEl) plateEl.remove(); if (ringEl) ringEl.remove(); }
          // 1.6.0 (the owner, of the box around a hexagon token): the selection follows the hexagon, a drawn token's or a picture's. The ring stands ready, and the style sheet shows it while the piece is selected, which is set with no redraw
          var hexSel = hexTok || (item.type === 'image' && !!item.isChar && item.shape === 'hexagon' && !hideFromMe), selEl = el.querySelector(':scope > svg.tok-selring');
          if (hexSel) { if (!selEl) { selEl = hexSvg('tok-selring'); selEl.firstChild.setAttribute('points', '12.7,-3 47.3,-3 63.6,26 47.3,55 12.7,55 -3.6,26'); el.appendChild(selEl); } }
          else if (selEl) selEl.remove();
          // [sinkcheck:hexplate-end]
          // Tokens carry a small front-side arrow (which side of the art is "forward")
          var fw = el.querySelector(':scope > .token-front');
          if (item.isChar && stanceOn('turning')) {   // token facing is a per-campaign VTT feature (Settings ▸ This campaign); when off there is no facing wedge
              if (!fw) { fw = document.createElement('div'); fw.className = 'token-front'; fw.innerHTML = '<i></i>'; el.appendChild(fw); }
              // Grids are square or flat-top hex, so the chosen side is always a face:
              // the arrow points straight across it at the neighboring cell.
              fw.style.transform = item.front ? 'rotate(' + item.front + 'deg)' : '';
              // The arrow itself turns the token (click / drag) when you may move it: the GM's selected token, or a player's own token
              // while it is selected (arrowTurnable)
              fw.classList.toggle('turnable', arrowTurnable(item, window.wpNet, state));
          } else if (fw) fw.remove();
          // Target marks: everyone targeting this token, shown as small copies of their own
          // tokens, centered in a row that wraps into rows and never leaves the token's edges.
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
                  marksEl._says = tgs.map(function(t, ti) { return markSays(t.name, tcov[ti], trng[ti], tlit[ti], thgt[ti]); });   // 1.6.0: the hover card's words for them (badgeLines)
                  marksEl.innerHTML = tgs.map(function(t, ti) {
                      var mine = targeterToken(t.id), cv = tcov[ti], tip = esc('Targeted by ' + t.name + (cv ? ' \u2014 ' + cv.name : ''));   // 1.6.3: the mark says what it means, not a name alone
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
              if (stEl.dataset.s !== stv) { stEl.dataset.s = stv; stEl.innerHTML = stv === 'dead' ? TOKEN_SKULL : TOKEN_X; stEl.title = stv === 'dead' ? 'Dead' : 'Down'; stEl.setAttribute('aria-label', stEl.title); }   // 1.6.3: the mark's words
          } else if (stEl) stEl.remove();
          el.classList.toggle('tok-dead', stv === 'dead');
          el.classList.toggle('tok-down', stv === 'down');
          // Stance chips (Settings ▸ This campaign, per campaign): a small row at the bottom of the token,
          // inside its own cell so one-token-per-hex still reads at grid scale.
          stanceChipsSync(el, item, activeMap);   // item 19b H5: its chips, as a move that lands with no redraw asks for them again (wpStanceChips)
          var fxHtml = item.isChar && window.wpSheets && window.wpSheets.tokenFx ? tokenFxHtml(window.wpSheets.tokenFx(item)) : '', fxEl = el.querySelector(':scope > .token-fx');   // conditions C1: its effects
          if (fxHtml) {
              if (!fxEl) { fxEl = document.createElement('div'); fxEl.className = 'token-fx'; el.appendChild(fxEl); }
              if (fxEl.dataset.sig !== fxHtml) { fxEl.dataset.sig = fxHtml; fxEl.innerHTML = fxHtml; }
          } else if (fxEl) fxEl.remove();
          pagePinSync(el, item, hideFromMe);   // 1.5.4 (pageshelf.js): a pin's mark, on the GM's screen alone
          boxMarkSync(el, item, hideFromMe);   // 1.6.2 (backlog 42, fold 2): a container's mark, for the GM and for players
          roomNameSync(el, item, rnPlaces);   // 1.6.2 (backlog 45, fold 3): the room's name on its place, on the GM's screen alone
          if (window.wpILayers) window.wpILayers.mark(el, item, activeMap);   // 1.6.2 (backlog 43): interaction layers, the GM's own screen
          var barL = item.isChar && window.wpSheets && window.wpSheets.tokenBars ? window.wpSheets.tokenBars(item, activeMap.id) : [], barEl = el.querySelector(':scope > svg.token-bars');   // backlog 28: its bars, a ring around it
          if (barL.length) {
              var barSig = tokenBarsSig(item, barL);
              if (!barEl || barEl.getAttribute('data-sig') !== barSig) { var barNew = tokenBarsSvg(item, barL); barNew.setAttribute('data-sig', barSig); if (barEl) el.replaceChild(barNew, barEl); else el.appendChild(barNew); }
          } else if (barEl) barEl.remove();
          var envT = item.isChar && window.wpSheets && window.wpSheets.tokenEnv ? window.wpSheets.tokenEnv(item) : null, envEl = el.querySelector(':scope > .token-env');   // 1.6.0: the map environment's badge (the owner: "As drawn")
          if (envT) {
              if (!envEl) { envEl = document.createElement('div'); envEl.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13.5V5a2 2 0 0 1 4 0v8.5a4 4 0 1 1-4 0z"/></svg>'; el.appendChild(envEl); }
              envEl.className = 'token-env ' + (envT.band === 'danger' ? 'danger' : 'warn'); envEl.title = envT.text; envEl.setAttribute('aria-label', envT.text);
          } else if (envEl) envEl.remove();
          tokMarksSync(el, item);   // 1.6.3: Token marks on my map, which marks fold and the dot's words
          if (item.id === state.selWbId && (!state.selWbIds || state.selWbIds.length === 1)) {   // a locked piece is selected and shown too (the owner, 2026-11-13: "when locked, i should still be able to click and highlight pieces"), with no handles (positionHandles)

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

      if (window.wpRoomNamesEnd) window.wpRoomNamesEnd();   // 1.6.3: the room names this draw asked for, placed above the pieces (wbbuild.js), the rest taken away
      positionHandles(activeMap);
      if (window.wpRefreshBlasts) window.wpRefreshBlasts();   // tokens moved: re-check who is in a blast
      if (typeof tagsDraw === 'function') tagsDraw(activeMap);   // 1.6.2 (vehicles, fold (c)): the marks one token holds on another

      

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
  // selected; nothing in the stream window. A door is fogcore isDoor. Whether a token is beside a door is fogcore doorBeside, the rule the host
  // opens a player's door by (1.6.3, the review of finding 14): by cells on a map with a lattice, by DOOR_NEAR pixels only where it has none.
  // The copies below stand in only where no core is at hand (a door drawn as a line measured to its own strokes, any other to its box)
  var DOOR_NEAR = 40;   // fogcore's: the reach in pixels on a map with no lattice
  function doorGap(box, door, F) {
      if (F && typeof F.doorGap === 'function') return F.doorGap(box, door);   // 1.6.3 (the review, finding 14): fogcore's, the rule the host judges a player's door by; this copy only where no core is at hand
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
  // The ids of the doors beside any of the tokens in mine. grid: the map's lattice as fogcore gridFor answers it (null with none), which
  // doorNearSync works out; with fogcore's doorBeside at hand that rule decides, else the board's own copy of the pixel reach
  function doorNearIds(items, mine, F, grid) {
      var out = []; if (!Array.isArray(items) || !Array.isArray(mine) || !mine.length || !F || typeof F.isDoor !== 'function') return out;
      var useCore = typeof F.doorBeside === 'function';
      items.forEach(function(w) {
          if (!w || typeof w.id !== 'string' || typeof w.x !== 'number' || typeof w.y !== 'number' || !isFinite(w.x) || !isFinite(w.y) || !F.isDoor(w)) return;
          var dc = useCore && grid ? (w.type === 'path' ? F.pathCells(w, grid) : F.itemCells(w, grid)) : null;   // the door's own cells, once for every token
          if (mine.some(function(b) { return useCore ? F.doorBeside(b, w, grid || null, dc) : doorGap(b, w, F) <= DOOR_NEAR; })) out.push(w.id);
      });
      return out;
  }
  function doorNearMine(am, sel, n) {   // the tokens of yours on this map (the tokens themselves: doorBeside reads their shape and turn)
      if (window.wpStream || !am || !Array.isArray(am.whiteboard)) return [];
      var player = !!(n && n.active && n.role === 'client'), ids = Array.isArray(sel) ? sel : [];
      return am.whiteboard.filter(function(w) {
          if (!w || !w.isChar || w.waiting || typeof w.x !== 'number' || typeof w.y !== 'number') return false;
          return player ? (!w.hidden && w.ownerId === n.myId) : ids.indexOf(w.id) >= 0;
      });
  }
  function doorNearSync(am) {
      var board = document.getElementById('whiteboard'); if (!board || !am || am.type !== 'map') return;
      var Fn = window.wpFogCore, gridN = Fn && typeof Fn.gridFor === 'function' ? Fn.gridFor((am.meta && am.meta.gridType) || 'off', am.fog && am.fog.cell, am.meta && am.meta.cell) : null;   // the lattice the host judges the door by (net.js's door branch asks the same)
      var sel = state.selWbIds || (state.selWbId ? [state.selWbId] : []), near = doorNearIds(am.whiteboard, doorNearMine(am, sel, window.wpNet), Fn, gridN), on = Object.create(null);
      near.forEach(function(id) { on[id] = 1; });
      board.querySelectorAll('.wb-item.wb-door, .wb-item.wb-door-near').forEach(function(el) { el.classList.toggle('wb-door-near', on[el.dataset.id] === 1 && el.classList.contains('wb-door')); });
  }
  // [fogcheck:doornear-end]
  // 1.6.3 (the owner's ruling of 2026-11-17, finding 2 of the improvement week's review: a player travels through a portal "Next to it"): whether a
  // token of yours may reach a portal on this screen's copy. The review of that fold: it asks the host's own rule (net.js portalReach, through
  // net.portalReach), so the tokens that count are the host's (a character's or a waiting one, never a hidden or locked one), a token on the portal
  // passes as a drop does, and a wall between counts. Before it read doorNearMine, which leaves waiting tokens out, so a player whose waiting
  // token stood beside the portal traveled with no promise. Read only so that a double-click from afar does not promise Traveling: the host is
  // the judge and says why. With no net module at hand it promises as before
  function portalNearMine(am, portal) {
      var n = window.wpNet; if (!n || typeof n.portalReach !== 'function' || !am || !portal) return true;
      return n.portalReach(portal, am);
  }
  // 1.6.3 (finding 8): a trigger zone the GM unticked Players see this zone, by fogcore zoneHid (the host's own judge); with no core, the tick on a trigger
  function zoneHidMe(w) { var F = window.wpFogCore; return F && typeof F.zoneHid === 'function' ? F.zoneHid(w) : !!w && w.type === 'trigger' && w.zoneHidden === true; }

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
      if (window.wpRoomNamesPlace) window.wpRoomNamesPlace();   // 1.6.3: a room's name follows its piece through a drag (wbbuild.js)
      try { lockRingSync(am); } catch (e) {}   // 1.6.2: a locked piece selected, its outline above the board
      if (!rHandle || !rotHandle) return;
      var z = state.zoomLevel || 1;
      var tf ='translate(-50%, -50%) scale(' + (1 / z) + ')';
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
  // [lookcheck:lockring-start]
  // 1.6.2 (the owner, 2026-11-13: "when locked, i should still be able to click and highlight pieces, so i know which im dealing with"; on a
  // generated map a floor is many abutting locked pieces of one texture). A locked piece selected alone wears its outline on a ring of its own,
  // above every piece of the board and below the handles, so a neighbor drawn after it, a wall line on its edge or its own texture never covers
  // it: its box, a circle round, a line or a region its own path. A picture is left to its own edge, which follows its visible part.
  // positionHandles places it, so it follows a zoom, a move and a redraw; 2 px on screen at every zoom.
  // The review of 2026-11-13: the ring is drawn fresh, never cloned from the piece, so it holds no pattern id and no element id (a clone's
  // pattern was found before the piece's own, which lost its texture), and it is emptied whenever it is hidden. A hexagon, a diamond, a
  // triangle or a star is outlined along the very polygon the style sheet clips it to (LR_POLY, by the class that draws each), since
  // abutting hexagons' boxes overlap. The piece the ring stands in for wears lr-on, the one class the style sheet takes its own outline away
  // by, so a locked piece with no ring (a character token, a waiting one) keeps its outline
  var LR_HEX = '25,0 75,0 100,50 75,100 25,100 0,50', LR_DIA = '50,0 100,50 50,100 0,50';
  var LR_POLY = { hexagon: LR_HEX, 'hex-trigger': LR_HEX, diamond: LR_DIA, 'trigger-diamond': LR_DIA, triangle: '50,0 0,100 100,100', star: '50,0 61,35 98,35 68,57 79,91 50,70 21,91 32,57 2,35 39,35' };
  var _lrEl = null;   // the piece that wears lr-on
  function lrPoly(el) {
      if (!el || !el.classList || typeof el.classList.contains !== 'function') return '';
      for (var k in LR_POLY) if (Object.prototype.hasOwnProperty.call(LR_POLY, k) && el.classList.contains(k)) return LR_POLY[k];
      return '';
  }
  function lockRingSync(am) {
      var wb = document.getElementById('whiteboard'); if (!wb) return;
      var ring = document.getElementById('lockSelRing');
      var it = am && am.type === 'map' && state.viewMode === 'visual' && state.selWbId && !(state.selWbIds && state.selWbIds.length > 1) ? am.whiteboard.find(function(x) { return x.id === state.selWbId; }) : null;
      var el = it && it.locked && it.type !== 'image' && !it.isChar && !it.waiting ? document.querySelector('.wb-item[data-id="' + it.id + '"]') : null;
      if (_lrEl && _lrEl !== el && _lrEl.classList) _lrEl.classList.remove('lr-on');
      _lrEl = null;
      if (!el || el.style.display === 'none') {
          if (el && el.classList) el.classList.remove('lr-on');
          if (ring) { ring.style.display = 'none'; ring.textContent = ''; delete ring.dataset.sig; }
          return;
      }
      if (!ring) { ring = document.createElement('div'); ring.id = 'lockSelRing'; ring.setAttribute('aria-hidden', 'true'); wb.appendChild(ring); }
      var z = state.zoomLevel || 1, px = 2 / z, svg = it.type === 'path' ? el.querySelector(':scope > svg') : null, src = svg ? svg.querySelector(':scope > path') : null, poly = src ? '' : lrPoly(el);
      ring.style.display = 'block'; ring.style.left = it.x + 'px'; ring.style.top = it.y + 'px';
      ring.style.width = (it.w || 0) + 'px'; ring.style.height = (it.h || 0) + 'px';
      ring.style.transform = it.rot ? 'rotate(' + it.rot + 'deg)' : 'none';
      ring.style.setProperty('--lr', px + 'px');
      ring.className = src ? 'lr-path' : poly ? 'lr-path lr-poly' : it.type === 'circle' ? 'lr-round' : '';
      var d = src ? src.getAttribute('d') || '' : '', vb = svg ? svg.getAttribute('viewBox') || '' : '', fr = src ? src.getAttribute('fill-rule') || '' : '';
      var sw = src ? parseFloat(src.getAttribute('stroke-width')) || 0 : 0, sc = (src && it.w && svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width) ? svg.viewBox.baseVal.width / it.w : 1;
      var sig = src ? 'p|' + it.id + '|' + d.length + '|' + d.slice(0, 48) + '|' + d.slice(-48) + '|' + vb + '|' + fr + '|' + sw + '|' + z : poly ? 'g|' + poly : '';
      if (ring.dataset.sig !== sig) {
          ring.dataset.sig = sig; ring.textContent = '';
          var NS = 'http://www.w3.org/2000/svg';
          if (src) {
              var sv = document.createElementNS(NS, 'svg'), p = document.createElementNS(NS, 'path');
              sv.setAttribute('viewBox', vb); sv.setAttribute('preserveAspectRatio', svg.getAttribute('preserveAspectRatio') || 'none');
              p.setAttribute('d', d); if (fr) p.setAttribute('fill-rule', fr);
              p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'var(--gold)'); p.setAttribute('stroke-width', String(Math.max(sw, 1.5 * px * sc)));
              p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
              sv.appendChild(p); ring.appendChild(sv);
          } else if (poly) {
              var sg = document.createElementNS(NS, 'svg'), pg = document.createElementNS(NS, 'polygon');
              sg.setAttribute('viewBox', '0 0 100 100'); sg.setAttribute('preserveAspectRatio', 'none'); pg.setAttribute('points', poly);
              sg.appendChild(pg); ring.appendChild(sg);
          }
      }
      if (el.classList) el.classList.add('lr-on');
      _lrEl = el;
  }
  // [lookcheck:lockring-end]
  // the sight outline's eye (fog.js setOutline): this machine's own choice, kept from one selection to the next
  function sightPref() { try { return localStorage.getItem('wp_sightOutline') === 'on'; } catch (e) { return false; } }
  function sightSync(id) { var F = window.wpFog; if (F && F.setOutline) F.setOutline(id); }
  function updateSelToolbar(am) {
      try { doorNearSync(am); } catch (e) {}   // 1.5.6: the doors beside a token of yours, again as the selection or a token moves
      if (window.wpRoomNamesNear) window.wpRoomNamesNear();   // 1.6.4: a room's name plate shows full size on a selected piece or a lit door (wbbuild.js window.wpRoomNamesNear)
      var bar = document.getElementById('selToolbar');
      if (!bar) return;
      var clientView = window.wpNet && window.wpNet.active && window.wpNet.role === 'client';
      var ids = (state.selWbIds && state.selWbIds.length) ? state.selWbIds : (state.selWbId ? [state.selWbId] : []);
      var its = ids.map(function(id) { return am.whiteboard.find(function(x) { return x.id === id; }); }).filter(Boolean);
      var selBarOff = (function() { try { return localStorage.getItem('wp_selBar') === 'off'; } catch (e) { return false; } })();   // 1.6.2: Settings' Bar over a selected piece
      bar.classList.toggle('st-folded', (function() { try { return localStorage.getItem('wp_selBarFold') === '1'; } catch (e) { return false; } })());   // and its own fold, this computer's
      if (selBarOff && !clientView && state.viewMode === 'visual' && its.length && !window.isDrawingMode && !window.isEraserMode) { bar.style.display = 'none'; var e1 = its.length === 1 && its[0].isChar && !its[0].waiting ? its[0] : null; sightSync(e1 && sightPref() && window.wpFog && window.wpFog.canOutline && window.wpFog.canOutline() ? e1.id : null); return; }   // the bar away, its sight outline still kept
      if (clientView || selBarOff || state.viewMode !== 'visual' || !its.length || window.isDrawingMode || window.isEraserMode) {
          bar.style.display = 'none';
          sightSync(null);
          return;
      }
      var minX = Math.min.apply(null, its.map(function(i) { return i.x; }));
      var maxR = Math.max.apply(null, its.map(function(i) { return i.x + i.w; }));
      var minY = Math.min.apply(null, its.map(function(i) { return i.y; }));
      var maxB = Math.max.apply(null, its.map(function(i) { return i.y + (i.h || 100); }));
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
      lockBtn.innerHTML = '<i class="wib wi-' + (anyUnlocked ? 'anchor-off' : 'anchor') + '"></i>';   // 1.6.2 (backlog 230): locked in place is an anchor, the padlock is for players
      lockBtn.classList.toggle('on', !anyUnlocked);
      var doorSel = !!(window.wpFogCore && window.wpFogCore.isDoor && its.some(function(i) { return window.wpFogCore.isDoor(i); }));
      lockBtn.title = (anyUnlocked ? 'Not locked in place: it can be dragged and resized. Click to lock it in place' : 'Locked in place: no drag or resize. Click to unlock') + (doorSel ? '. This is not the lock of the door itself: right-click the door for Lock door for players' : '');
      var visBtn = bar.querySelector('.st-vis');
      visBtn.innerHTML = '<i class="wib wi-' + (anyVisible ? 'seen' : 'unseen') + '"></i>';   // 1.6.2 (backlog 228): a player with an eye, never the sight button's eye
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
          var allRatio = selRatioLocked(its);
          ratioBtn.classList.toggle('on', allRatio);
          ratioBtn.title = allRatio ? 'Proportions locked: resizing keeps the shape, and Shift while dragging reshapes it freely. Click to unlock' : 'Proportions free: resizing reshapes it, and Shift while dragging keeps the shape. Click to lock';
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
      if (barOverStrips(bar, ['trkStrip', 'combatStrip'])) bar.style.transform = 'translate(-50%, ' + (Math.round((maxB - minY) * z) + 12) + 'px)';   // the live test, 2026-10-30: over the turn strip it half-covered its buttons: it stands under the selection. 1.6.3 (the combat review, finding 34): the fight stands inside the trackers bar since backlog 219, so the whole bar is kept clear
      barKeepIn(bar, Math.round((maxB - minY) * z) + 12);   // 1.6.2, found by hand: a piece near the map's edge put half the bar, and its fold arrow, out of sight
  }

  // [lookcheck:barkeep-start]
  // The bar over a selected piece kept inside the part of the map in sight: moved back from an edge it would pass, and set under the piece
  // where there is no room above it (below: how far under the selection's top that is). A box with no size moves nothing
  // 1.6.3 (the combat review, finding 34): whether the bar over a selected piece lies over any of the boxes named by ids that show (the trackers bar,
  // which holds the fight, and the turn strip where it stands alone). A box with no size, or one that is not there, is passed over
  function barOverStrips(bar, ids) {
      var br = null;
      return (ids || []).some(function(id) {
          var e = document.getElementById(id), sr = e && e.getBoundingClientRect ? e.getBoundingClientRect() : null; if (!sr || !(sr.width > 0) || !(sr.height > 0)) return false;
          br = br || bar.getBoundingClientRect(); return br.left < sr.right && sr.left < br.right && br.top < sr.bottom && sr.top < br.bottom;
      });
  }
  function barKeepIn(bar, below) {
      var wrap = bar && bar.parentNode, wr = wrap && wrap.getBoundingClientRect ? wrap.getBoundingClientRect() : null, br = bar.getBoundingClientRect();
      if (!wr || !(br.width > 0) || !(wr.width > 0)) return;
      var vl = Math.max(wr.left, 0) + 6, vr = Math.min(wr.right, window.innerWidth) - 6, vt = Math.max(wr.top, 0) + 4, dx = 0;
      if (br.right > vr) dx = vr - br.right;
      if (br.left + dx < vl) dx = vl - br.left;
      if (dx) bar.style.left = (parseFloat(bar.style.left) || 0) + dx + 'px';
      if (br.top < vt && typeof below === 'number' && below > 0) bar.style.transform = 'translate(-50%, ' + below + 'px)';
  }
  // [lookcheck:barkeep-end]

  /* Fit to grid: size the selection to whole cells and seat it. Hex maps —
     tokens and hex shapes become exactly one cell; anything else rounds to
     whole columns/rows of cells and centers on a cell. Square grids — width,
     height and position round to the 50px lattice. */
  // [lookcheck:fitpic-start]
  // A picture is drawn whole inside its box (object-fit: contain), so a box of other proportions shows it in its middle. Fit to grid sizes a
  // picture by the part it shows (the owner's recording, 2026-11-06: a near-square picture of 74 by 76 was given one cell by two, rounded each
  // way apart, and was drawn half a cell off). ratio: the picture's own width over its height, 0 where it is not known: the box as before
  function fitShown(it, ratio) {
      var w = it.w || 100, h = it.h || 100;
      if (!(ratio > 0) || !isFinite(ratio)) return { x: it.x, y: it.y, w: w, h: h };
      var vw = Math.min(w, h * ratio), vh = vw / ratio;
      return { x: it.x + (w - vw) / 2, y: it.y + (h - vh) / 2, w: vw, h: vh };
  }
  function fitPicRatio(it) {
      if (!it || it.type !== 'image' || typeof it.id !== 'string' || !it.id || typeof document === 'undefined') return 0;
      var q = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(it.id) : it.id.replace(/[^\w-]/g, ''), img = document.querySelector('.wb-item[data-id="' + q + '"] img');
      return img && img.naturalWidth > 0 && img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 0;
  }
  // [lookcheck:fitpic-end]
  function fitItemInPlace(it, g, ratio) {
    var ox = it.x, oy = it.y, ow = it.w, oh = it.h, sh = fitShown(it, ratio === undefined ? fitPicRatio(it) : ratio);
    var LF = (typeof window !== 'undefined' && window.wpLatticeOf ? window.wpLatticeOf() : null);   // the map's own cell (backlog 38): today's 60 by 52 hex and 50 px square where it sets none
    if (g === 'hex') {
        var fs = LF && LF.type === 'hex' ? LF.s : 30, fh = LF && LF.type === 'hex' ? LF.h : 52;
        if (it.isChar || it.type === 'hexagon' || it.shape === 'hexagon') { it.w = 2 * fs; it.h = fh; }
        else {
            var rows = Math.max(1, Math.round(sh.h / fh)), cols = Math.max(1, Math.round((sh.w - fs / 2) / (1.5 * fs)));
            it.x = sh.x; it.y = sh.y; it.w = cols * 1.5 * fs + fs / 2; it.h = rows * fh;
        }
        if (window.wpSeatHex) window.wpSeatHex(it, null, true);
    } else {
        var fz = LF && LF.type === 'square' ? LF.size : 50, fx0 = LF && LF.ox || 0, fy0 = LF && LF.oy || 0;
        it.w = Math.max(fz, Math.round(sh.w / fz) * fz);
        it.h = Math.max(fz, Math.round(sh.h / fz) * fz);
        it.x = Math.round((sh.x - fx0) / fz) * fz + fx0; it.y = Math.round((sh.y - fy0) / fz) * fz + fy0;
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
        var moved = fitItemInPlace(cl, g, fitPicRatio(it));
        if (moved || (window.wpSystemCore && window.wpSystemCore.shapeStandIn && window.wpSystemCore.shapeStandIn(cl, getActiveMap()))) return true;   // it would move or resize, or once fitted take the cell's shape
    }
    return false;
}
function fitToGrid(its) {
    var g = state.gridType;
    if (!g || g === 'off') { toast('Turn on a square or hex grid first, with the grid button in the toolbar.'); return; }
    var n = 0;
    its.forEach(function(it) {
        if (it.locked || it.type === 'path') return;
        it.gridFit = true;   // remember it's grid-fitted, so it re-seats to the cell CENTER on every move (not just this one-shot) — a hex move used to leave it ~half a cell off in x
        var fitted = fitItemInPlace(it, g);
        var reshaped = !!(window.wpSystemCore && window.wpSystemCore.shapeStandIn && window.wpSystemCore.shapeStandIn(it, getActiveMap()));   // grid-shaped tokens: once fitted, a one-cell token takes the cell's shape too (one press is final)
        if (fitted || reshaped) n++;
    });
    if (n) { save(); render(); toast('Fitted ' + n + ' item' + (n === 1 ? '' : 's') + ' to the ' + g + ' grid.'); }
    else { toast('Already aligned to the grid.'); }
}
// [buildcheck:alignpic-start]
// 1.6.2 (backlog 38; the owner, 2026-11-07, by prompt: "Both": align now, a per-map cell size as a later fold): a map picture with a grid
// printed on it is sized and placed so that its grid lies on the board's. Two clicks on the picture and how many cells lie between them: the
// picture is scaled about the first point, the same both ways, so nothing is distorted, and that point is then moved onto the board's
// lattice, a corner of a square cell or the center of a hex. The grid itself is never changed. Why a picture cannot be aligned, or ''
function alignMay(w, grid) {
    if (!w || typeof w !== 'object' || w.type !== 'image') return 'Pick a map picture first.';
    if (w.isChar || w.waiting) return 'A token is sized by Fit to grid cells, not by a grid on its picture.';
    if (w.locked && !(typeof window !== 'undefined' && window.wpBuildCore && window.wpBuildCore.structOk && window.wpBuildCore.structOk(w))) return 'Unlock the picture first.';   // backlog 231: a map's own picture, locked as its ground, is aligned and trimmed in place and keeps its lock
    if ((Number(w.rot) || 0) % 360) return 'Turn the picture straight first: Align its grid needs a picture with no rotation.';
    if (grid !== 'square' && grid !== 'hex') return 'Turn on a square or hex grid first.';
    return '';
}
// The picture's new box: a and b the two points clicked (board px), n the cells between them, step one cell's length along a row or column
// (50 on a square grid, 52 down a hex column), seat(x, y) the board's lattice point nearest a point. Null where it cannot be worked out
function alignFit(w, a, b, n, step, seat) {
    if (!w || !a || !b || typeof seat !== 'function') return null;
    var d = Math.hypot(b.x - a.x, b.y - a.y), k = n * step / d;
    if (!(n >= 1) || n !== Math.floor(n) || n > 1000 || !(d >= 4) || !isFinite(k)) return null;
    var nw = (Number(w.w) || 100) * k, nh = (Number(w.h) || 100) * k;
    if (!(nw >= 10 && nh >= 10 && nw <= 200000 && nh <= 200000)) return null;
    var to = seat(a.x, a.y); if (!to || !isFinite(to.x) || !isFinite(to.y)) return null;
    var r2 = function(v) { return Math.round(v * 100) / 100; };
    return { x: r2(a.x + ((Number(w.x) || 0) - a.x) * k + to.x - a.x), y: r2(a.y + ((Number(w.y) || 0) - a.y) * k + to.y - a.y), w: r2(nw), h: r2(nh) };
}
function alignWords(grid, step) {
    if (step === 1) return grid === 'hex' ? 'Click the center of a hex on the picture. Esc cancels.' : 'Click a corner where two lines of the picture\u2019s grid cross. Esc cancels.';
    return grid === 'hex' ? 'Now click the center of another hex in the same column, a few hexes up or down. Esc cancels.' : 'Now click another corner a few cells along the same row or column. Esc cancels.';
}
function alignArm(rec) {
    var mv = document.getElementById('moveModeBtn');
    if (mv && (!mv.classList.contains('active') || window.isMeasureMode)) mv.click();
    window.wpPlace = { type: 'align', props: {}, align: rec };
    if (wbWrap) wbWrap.style.cursor = 'crosshair';
    document.body.classList.add('placing');
    toast(alignWords(state.gridType, rec.step));
}
function alignPiece(rec) {
    var map = getActiveMap();
    return map && map.id === rec.map && Array.isArray(map.whiteboard) ? map.whiteboard.find(function(i) { return i && i.id === rec.id; }) || null : null;
}
function alignStep(rec, x, y) {
    var w = alignPiece(rec), why = alignMay(w, state.gridType);
    if (!w) { toast('That picture is no longer on this map.'); return; }
    if (why) { toast(why); return; }
    if (rec.step === 1) { rec.a = { x: x, y: y }; rec.step = 2; alignArm(rec); return; }
    var a = rec.a, b = { x: x, y: y };
    showPrompt(state.gridType === 'hex' ? 'How many hexes apart are the two points?' : 'How many cells apart are the two points?', '', function(v) {
        if (v === null || v === undefined) return;
        var p = alignPiece(rec), g = state.gridType, no = alignMay(p, g);
        if (!p) { toast('That picture is no longer on this map.'); return; }
        if (no) { toast(no); return; }
        var n = Number(String(v).trim());
        var AL = (typeof window !== 'undefined' && window.wpLatticeOf ? window.wpLatticeOf() : null), az = AL && AL.type === 'square' ? AL.size : 50, ax0 = AL && AL.ox || 0, ay0 = AL && AL.oy || 0;   // the map's own cell (backlog 38)
        var f = alignFit(p, a, b, n, g === 'hex' ? (AL && AL.type === 'hex' ? AL.h : 52) : az, g === 'hex' ? function(px, py) { return snapToHex(px, py, 30, 'center'); } : function(px, py) { return { x: Math.round((px - ax0) / az) * az + ax0, y: Math.round((py - ay0) / az) * az + ay0 }; });
        if (!f) { toast(!(n >= 1) || n !== Math.floor(n) || n > 1000 ? 'Type a whole number of cells, from 1 to 1000.' : 'The two points are too close together, or the picture would be too large. Try two points further apart.'); return; }
        p.x = f.x; p.y = f.y; p.w = f.w; p.h = f.h; delete p.gridFit;
        save(); render();
        toast('The picture\u2019s grid now lies on the board\u2019s. Undo puts it back.');
    });
}
window.wpAlignPic = function(w) {
    var why = alignMay(w, state.gridType), map = getActiveMap();
    if (why) { toast(why); return; }
    if (!map) return;
    alignArm({ id: w.id, map: map.id, step: 1 });
};
// [buildcheck:alignpic-end]
// [buildcheck:trimpic-start]
// 1.6.2 (backlog 37; the owner, 2026-11-07, by prompt: "Trim to picked cells (Recommended)"): Trim to cells keeps the cells of a map
// picture the GM picks and draws it cut to their outline (fogcore cleanTrim, trimPath, trimRebase). While it is in hand a click keeps or
// lets go of one cell and a drag a box of them, the picture shown whole and faded with the kept part at full strength; each change is one
// save, so Undo takes it back; Esc puts it down. Whole picture takes the trim off. The picture's file is never changed
function trimMay(w, grid) { var why = alignMay(w, grid); return why.indexOf('Turn the picture straight') === 0 ? 'Turn the picture straight first: Trim to cells needs a picture with no rotation.' : why; }
function trimArm(rec, say) {
    var mv = document.getElementById('moveModeBtn');
    if (mv && (!mv.classList.contains('active') || window.isMeasureMode)) mv.click();
    window.wpPlace = { type: 'trim', props: {}, trim: rec };
    if (wbWrap) wbWrap.style.cursor = 'crosshair';
    document.body.classList.add('placing');
    if (say) toast('Click a cell to keep it, or drag over cells. Click a kept cell to let it go. Press Esc when you are done.');
}
// The cells a click or a drag changes, and the trim after it: a click keeps a cell or lets it go; a drag keeps every cell under its box,
// or lets them all go where it began on a kept cell. Null where past TRIM_MAX
function trimEdit(t, FC, grid, px, py, pw, ph, sx, sy) {
    var key = function(c) { return grid.type === 'square' ? [c.c, c.r] : [c.q, c.r]; }, have = Object.create(null);
    t.cells.forEach(function(c) { have[c[0] + ',' + c[1]] = 1; });
    var start = key(FC.cellOf(sx, sy, grid)), sk = start.join(','), list;
    if (!(pw > 12 || ph > 12)) { if (have[sk]) delete have[sk]; else have[sk] = 1; }
    else {
        list = FC.cellsUnderRect(px, py, pw, ph, grid) || [];
        var drop = !!have[sk];
        list.forEach(function(c) { var k = key(c).join(','); if (drop) delete have[k]; else have[k] = 1; });
    }
    var cells = Object.keys(have).map(function(k) { return k.split(',').map(Number); });
    if (cells.length > FC.TRIM_MAX) return null;
    return { g: t.g, box: t.box, cells: cells };
}
function trimStep(rec, px, py, pw, ph, sx, sy) {
    var w = alignPiece(rec), g = state.gridType, why = trimMay(w, g), FC = window.wpFogCore;
    if (!w) { toast('That picture is no longer on this map.'); render(); return; }
    if (why) { toast(why); render(); return; }
    if (!FC || typeof FC.trimRebase !== 'function') return;
    var TM = getActiveMap(), cell = TM && TM.meta ? TM.meta.cell : null, grid = FC.gridFor(g, null, cell), t = FC.trimRebase(w.trim, w.x, w.y, w.w || 100, w.h || 100, g, cell);   // the map's own cell (backlog 38)
    var next = trimEdit(t, FC, grid, px, py, pw, ph, sx, sy);
    if (!next) { toast('A picture keeps at most ' + FC.TRIM_MAX + ' cells.'); trimArm(rec, false); return; }
    var clean = FC.cleanTrim(next);
    if (clean) w.trim = clean; else delete w.trim;
    trimArm(rec, false);
    save(); render();
}
window.wpTrimPic = function(w) {
    var why = trimMay(w, state.gridType), map = getActiveMap();
    if (why) { toast(why); return; }
    if (!map) return;
    trimArm({ id: w.id, map: map.id }, true);
    render();
};
window.wpTrimReset = function(w) {
    if (!w || !w.trim) return;
    delete w.trim; save(); render();
    toast('The whole picture shows again. Undo puts the trim back.');
};
// The clip a picture wears: its trim's outline as a path in its own box, kept by its id while the trim and the box are the same
var _trimClip = {};
function trimClipOf(item) {
    var FC = window.wpFogCore; if (!item || !item.trim || !FC || typeof FC.trimPath !== 'function') return '';
    var w = Number(item.w) || 100, h = Number(item.h) || 100, k = _trimClip[item.id];
    if (k && k.t === item.trim && k.w === w && k.h === h) return k.p;
    var p = FC.trimPath(item.trim, w, h); _trimClip[item.id] = { t: item.trim, w: w, h: h, p: p }; return p;
}
// Lays a picture's trim on its element: the clip on the picture alone (never the selection's outline or handles), and while Trim to cells
// is in hand for it, the whole picture faded with the kept part over it
function trimDraw(el, imEl, item) {
    var tp = trimClipOf(item), on = !!(window.wpPlace && window.wpPlace.trim && window.wpPlace.trim.id === item.id);
    var clip = tp ? "path('" + tp + "')" : '', keep = el.querySelector(':scope > img.trim-keep');
    if (imEl.style.clipPath !== (on ? '' : clip)) imEl.style.clipPath = on ? '' : clip;
    el.classList.toggle('wb-trimming', on);
    if (on && clip) {
        if (!keep) { keep = document.createElement('img'); keep.className = 'trim-keep'; keep.alt = ''; el.appendChild(keep); }
        if (keep.getAttribute('src') !== imEl.getAttribute('src')) keep.src = imEl.getAttribute('src');
        if (keep.style.clipPath !== clip) keep.style.clipPath = clip;
    } else if (keep) keep.remove();
}
// [buildcheck:trimpic-end]
// [lookcheck:tokfit-start]
// 1.6.2 (backlog 141; the owner, 2026-11-06, by prompt: "Yes, one cell (Recommended)", "Trim and center (Recommended)"): a picture ticked
// Is Character fits one cell of the map's grid and is seated in it, in the very change the tick saves, so Undo puts it back. Then, apart,
// an empty or see-through border is trimmed and the rest centered in a square (framecore trimRect), saved as a new picture with the
// original kept as its frame, so Frame picture still changes it. Only on the machine that owns the campaign. True when it was resized
function tokenFit(w) {
    var am = getActiveMap(), SC = window.wpSystemCore;
    if (!w || !am || am.type !== 'map' || !SC || !SC.tokenOneCell || !(window.wpCanPersistLocal && window.wpCanPersistLocal())) return false;
    var fit = SC.tokenOneCell(w, am);
    if (fit && window.wpSeatCell) window.wpSeatCell(w, am);
    var worn = SC.cleanFrame ? SC.cleanFrame(w.frame) : null;
    if (w.isChar && w.type === 'image' && typeof w.src === 'string' && w.src && !w.charId && !(worn && worn.of === w.src)) { var mid = am.id, wid = w.id, was = w.src; setTimeout(function() { tokenTrim(mid, wid, was); }, 0); }
    return fit;
}
function tokenTrim(mapId, id, was) {
    var S = window.wpSheets, FC = window.wpFrameCore;
    if (!S || !S.applyTokenFrame || !FC || !FC.trimRect || typeof document === 'undefined' || !picRef(was)) return;
    var img = new Image();
    img.onload = function() {
        var W = img.naturalWidth, H = img.naturalHeight; if (!(W > 0 && H > 0)) return;
        var k = Math.min(1, 1024 / Math.max(W, H)), aw = Math.max(1, Math.round(W * k)), ah = Math.max(1, Math.round(H * k));
        var cv = document.createElement('canvas'); cv.width = aw; cv.height = ah; var cx = cv.getContext('2d'); if (!cx) return;
        cx.drawImage(img, 0, 0, aw, ah);
        var px; try { px = cx.getImageData(0, 0, aw, ah).data; } catch (e) { return; }
        var r = FC.trimRect(px, aw, ah); if (!r) return;
        var kx = W / aw, ky = H / ah, s1 = r.s * Math.max(kx, ky), out = FC.outSide ? FC.outSide(s1, 512) : 256, f = out / s1;
        var oc = document.createElement('canvas'); oc.width = out; oc.height = out; var octx = oc.getContext('2d'); if (!octx) return;
        octx.drawImage(img, r.bx * kx, r.by * ky, r.bw * kx, r.bh * ky, (s1 - r.bw * kx) / 2 * f, (s1 - r.bh * ky) / 2 * f, r.bw * kx * f, r.bh * ky * f);
        oc.toBlob(function(blob) {
            if (!blob) return;
            var s0 = Math.min(s1, W, H), fx = Math.max(0, Math.min(W - s0, r.x * kx)), fy = Math.max(0, Math.min(H - s0, r.y * ky));
            S.applyTokenFrame(mapId, [id], { blob: blob, was: was, frame: { src: was, x: fx, y: fy, s: s0 } }).then(function(ok) { if (ok) toast('Its empty border is trimmed and the picture centered. Frame picture changes it.'); });
        }, 'image/png');
    };
    img.src = was;
}
window.wpTokenFit = tokenFit;
// [lookcheck:tokfit-end]
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
      var gidMap = {}, copies = [], pairs = [];
      // 1.6.3, the review of 87d9b6e0: a flattened picture is duplicated with the pieces drawn into it (flatten.js flatKids), and the copies are
      // named for each other below (flatRemap), so the copy holds its own walls and never names the picture it was made from
      var flatAlso = typeof flatKids === 'function' ? flatKids(am.whiteboard, its.filter(Boolean)) : [];
      its.concat(flatAlso).forEach(function(src) {
          if (!src || src.waiting) return;   // Onboarding F1a: a waiting token is the host's alone, never copied
          var it = JSON.parse(JSON.stringify(src));
          it.id = 'wb' + uid() + Math.random().toString(36).slice(2, 5);
          delete it.ownerId; delete it.charId; delete it.threats;   // a copy is a new creature, not a second token of the character (5h: nor its threat marks)
          if (it.box !== undefined) { if (window.wpBoxes && window.wpBoxes.copyFor) window.wpBoxes.copyFor(it); else delete it.box; }   // 1.6.2 (backlog 42): a copied container holds a copy of its own
          if (it.groupId) {
              if (!gidMap[it.groupId]) gidMap[it.groupId] = 'group_' + Date.now() + Math.random().toString(36).slice(2, 6);
              it.groupId = gidMap[it.groupId];
          }
          var hexy = state.gridType === 'hex' && (it.isChar || it.type === 'hexagon' || it.shape === 'hexagon');
          if (hexy) { it.x += 45; it.y += 26; if (window.wpSeatHex) window.wpSeatHex(it, am); }   // the next cell over (flat-top: down-right)
          else { it.x += 25; it.y += 25; }
          am.whiteboard.push(it);
          pairs.push({ old: src.id, it: it });
      });
      var flatHeld = typeof flatRemap === 'function' ? flatRemap(pairs) : {};
      pairs.forEach(function(p) { if (flatHeld[p.it.id] !== 1) copies.push(p.it); });   // a piece drawn into a copied picture stays out of sight, so it is not picked
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
          else if (i.type === 'path') { var p = el.querySelector('svg > path'), pr = i.tip === 'fill' ? el.querySelector('svg > defs > pattern > rect') : null; if (pr) pr.setAttribute('fill', cssColor(v, 'transparent')); else if (p) { if (i.tip === 'fill') p.style.fill = v; else p.style.stroke = v; } }   // its own path, never a pattern's; a textured region: the color under its pattern
          else if (i.type !== 'image' && i.type !== 'trigger') el.style.backgroundColor = v;   // the color alone, so a recolor keeps a piece's texture
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
          if (act === 'fold') { var fo = !bar.classList.contains('st-folded'); try { if (fo) localStorage.setItem('wp_selBarFold', '1'); else localStorage.removeItem('wp_selBarFold'); } catch (e2) {} var amF = getActiveMap(); if (amF) updateSelToolbar(amF); return; }   // 1.6.2: the bar folds to one small button and back
          var its = selToolbarItems();
          if (!its.length) return;
          if (act === 'sheet') { if (its.length === 1 && its[0].charId && window.wpSheets && window.wpSheets.canOpen(its[0].charId)) window.wpSheets.openSheet(its[0].charId); return; }
          if (act === 'props') { if (window.wpOpenRightPanel) window.wpOpenRightPanel(); return; }   // 1.6.2 (backlog 229; the owner: "there can be a properties option in the item toolbar too")
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
              var lockThemR = !selRatioLocked(its);
              its.forEach(function(i) { ratioLockSet(i, lockThemR); });
          } else if (act === 'fog') {
              var markThem = its.some(function(i) { return !i.fogged; });
              its.forEach(function(i) { if (markThem) i.fogged = true; else delete i.fogged; });
              if (window.wpFog) { window.wpFog.invalidateVision(); window.wpFog.redraw(); }
              import('./io.js').then(function(m) { m.toast(markThem ? 'Marked as a play area. With fog on, only marked items are fogged.' : 'No longer a play area.'); });
          } else if (act === 'up' || act === 'down') {
              its.forEach(function(i) {
                  var idx = LAYERS.indexOf(i.layer || 'middle');
                  i.layer = LAYERS[act === 'up' ? Math.min(LAYERS.length - 1, idx + 1) : Math.max(0, idx - 1)];
              });
          } else if (act === 'del') {
              // 1.6.3 (findings 15 and 16): delask.js asks first where the selection holds a locked piece, a token or a flattened picture's
              // pieces, and saves and draws once the pieces have gone (a waiting token stays away this session, Onboarding F1a)
              var am = getActiveMap();
              delWb(am, its.map(function(i) { return i.id; }), showConfirm, function(out) { state.selWbIds = []; state.selWbId = null; save(); if (window.appRender) window.appRender(); toast(delSaid(out)); }, getActiveMap);
              return;
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
  // [buildcheck:ratiolock-start]
  // Lock proportions is on by default (the owner, 2026-11-13: "lets lock proportions when resizing by default", and "All, Shift frees it"):
  // every picture and shape, those already on maps too, keeps its shape when resized by its corner, unless it carries lockRatio: false. One
  // reading, so no save needs changing: absent or true is locked, false is free. Text and pen lines, which Properties offers no tick for,
  // keep the reading they had: locked only where true. ratioLockSet writes the one key the reading needs.
  function ratioLocked(w) {
      if (!w || typeof w !== 'object') return false;
      return w.type === 'text' || w.type === 'path' ? w.lockRatio === true : w.lockRatio !== false;
  }
  function ratioLockSet(w, on) {
      if (!w || typeof w !== 'object') return;
      if (w.type === 'text' || w.type === 'path') { if (on) w.lockRatio = true; else delete w.lockRatio; }
      else if (on) delete w.lockRatio; else w.lockRatio = false;
  }
  // The corner handle keeps the shape where the lock holds, and Shift held while dragging turns it the other way: a locked piece reshapes
  // freely, and a free one keeps its shape as it always did
  function ratioHeld(locked, shift) { return !!locked !== !!shift; }
  // A selection of several pieces reads one rule in both places (the review of 2026-11-13): the group's corner keeps the shape where any member
  // is locked, so the toolbar's button shows on, and its press frees the whole selection, by that same reading
  function selRatioLocked(list) { return Array.isArray(list) && list.some(ratioLocked); }
  // The ratio a locked resize keeps while it steps by whole cells (the review of 2026-11-13): the box's own, but for a picture whose box already
  // shows its shape (within 2%), which keeps the picture's exact ratio as the box's rounded one may not. A character token is fitted to its cell
  // whatever its picture's shape, so it always keeps its box's: by its picture's a 50 by 50 token of a 2:3 picture jumped to two cells at once.
  // pr: the picture's width over its height, 0 where it is not known
  function stepRatio(it, w, h, pr) {
      var br = w > 0 && h > 0 ? w / h : 0;
      if (!br || !it || it.isChar || !(pr > 0) || !isFinite(pr)) return br;
      return Math.abs(br - pr) / pr <= 0.02 ? pr : br;
  }
  window.wpRatioLocked = ratioLocked; window.wpRatioLockSet = ratioLockSet;
  // [buildcheck:ratiolock-end]
  function attachResizeHandle() {

      var handle = document.getElementById('globalResizeHandle');

      if(!handle) return;

      // [systemcheck:gridstep-start]
      // With Snap on to the grid, a resize steps by whole cells (the owner, 2026-11-06: "when magnet is on, lets only allow resizing by grid block
      // size steps"): on a square grid 50 px each way, on a hex grid as Fit to grid counts a hex cell, a column 45 px beside the 15 px edge and a
      // row 52 px. gridStepOn answers the grid, or null where Snap is off or to other items only, or the map has no grid. box: a group's box,
      // stepped by the cell's own size. lock (Lock proportions or Shift, the owner: "yes please"): { r: width over height, byH: the drag leads
      // with the height }; the side dragged steps by whole cells and the other takes its shape, to the nearest whole cell
      function gridStepOn() {
          var on = typeof window.wpSnapOn === 'function' ? window.wpSnapOn() : (!!state.snap && state.snapMode !== 'items');
          return on && (state.gridType === 'square' || state.gridType === 'hex') ? state.gridType : null;
      }
      function gridStep(w, h, g, box, lock) {
          var LR = (typeof window !== 'undefined' && window.wpLatticeOf ? window.wpLatticeOf() : null), hs = LR && LR.type === 'hex' ? LR.s : 30, edge = g === 'hex' && !box ? hs / 2 : 0, sx = g === 'hex' ? 1.5 * hs : LR && LR.type === 'square' ? LR.size : 50, sy = g === 'hex' ? (LR && LR.type === 'hex' ? LR.h : 52) : sx;   // the map's own cell (backlog 38)
          var W = function(v) { return Math.max(1, Math.round((v - edge) / sx)) * sx + edge; }, H = function(v) { return Math.max(1, Math.round(v / sy)) * sy; };
          var r = lock && typeof lock.r === 'number' && isFinite(lock.r) && lock.r > 0 ? lock.r : 0;
          if (!r) return { w: W(w), h: H(h) };
          if (lock.byH) { var hh = H(h); return { w: W(hh * r), h: hh }; }
          var ww = W(w); return { w: ww, h: H(ww / r) };
      }
      // [systemcheck:gridstep-end]
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

      var dx = wbDX(e.clientX - startX, e.clientY - startY);
      var dy = wbDY(e.clientX - startX, e.clientY - startY);
      if (groupMembers) {
          // The handle sits on the selection's corner: dragging it scales the
          // whole box from its top-left, every member along with it.
          var gsx = Math.max(0.05, (gbw + dx) / gbw), gsy = Math.max(0.05, (gbh + dy) / gbh);
          var lockG = ratioHeld(selRatioLocked(groupMembers.map(function(g) { return g.it; })), e.shiftKey);   // Lock proportions (on unless a member is freed), and Shift turns it
          if (lockG) { var u = Math.abs(dx) >= Math.abs(dy) ? gsx : gsy; gsx = u; gsy = u; }
          var gSg = gridStepOn(); if (gSg) { var lkG = lockG ? { r: gbw / gbh, byH: Math.abs(dx) < Math.abs(dy) } : null, stG = gridStep(gbw * gsx, gbh * gsy, gSg, true, lkG); gsx = stG.w / gbw; gsy = stG.h / gbh; }   // Snap on to the grid: the box by whole cells
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
      // Proportional resize: the item's Lock proportions (on unless it is freed), and Shift held while dragging turns it the other way
      var lockR = ratioHeld(ratioLocked(item), e.shiftKey);
      if (lockR && startW > 0 && startH > 0) {
          var ratio = startW / startH;
          if (Math.abs(dx) >= Math.abs(dy)) item.h = Math.max(10, item.w / ratio);
          else item.w = Math.max(10, item.h * ratio);
      }



          // Size matching runs even with the ratio locked: whichever axis pauses
          // on a neighbor's size, the other follows the ratio.
          var wBefore = item.w, hBefore = item.h, gS1 = gridStepOn();
          if (gS1) { var lk1 = lockR && startW > 0 && startH > 0 ? { r: stepRatio(item, startW, startH, item.isChar ? 0 : fitPicRatio(item)), byH: Math.abs(dx) < Math.abs(dy) } : null, st1 = gridStep(item.w, item.h, gS1, false, lk1); item.w = st1.w; item.h = st1.h; clearSnaps(); }   // Snap on to the grid: whole cells, and no pause at a neighbor's size between them
          else {
          doSmartSnapping(item, true);
          if (lockR && startW > 0 && startH > 0) {
              var ratioL = startW / startH;
              if (item.w !== wBefore) item.h = Math.max(10, item.w / ratioL);
              else if (item.h !== hBefore) item.w = Math.max(10, item.h * ratioL);
          }
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
  // 1.6.2, backlog 202: the keys that turn the selected tokens and pick the next token of yours (commands.js). A turn is the facing arrow's own
  // press: a player turns their own token, not locked, the table not paused for them, and it lands as the arrow's release lands. Each answers
  // true, or words that say why nothing happened
  window.wpKeyTurn = function(steps) {
      var am = getActiveMap(); if (!am || am.type !== 'map' || state.viewMode !== 'visual') return 'Turning works on the play map.';
      if (window.wpVtt && !window.wpVtt.on('turning')) return 'Token facing is switched off.';
      var n = window.wpNet, client = !!(n && n.active && n.role === 'client'), ids = (state.selWbIds && state.selWbIds.length) ? state.selWbIds : (state.selWbId ? [state.selWbId] : []), done = 0;
      if (client && (n.paused || n.selfPaused || n.selfHeld || n.reconnecting)) return n.reconnecting && !(n.paused || n.selfPaused || n.selfHeld) ? 'You are reconnecting to the GM.' : 'The table is paused for you.';   // 1.6.3 (the multiplayer review, finding 15): a reconnect holds the board as a pause does
      ids.forEach(function(id) {
          var it = am.whiteboard.find(function(x) { return x && x.id === id; }); if (!it || !it.isChar) return;
          if (client && (it.ownerId !== n.myId || it.locked)) return;
          window.wpTurnToken(it, steps < 0 ? -1 : 1); if (n && n.active && n.streamPos) n.streamPos(it, true, am.id); done++;
      });
      if (!done) return client ? 'Select a token of yours to turn it.' : 'Select a character token to turn it.';
      save(); render(); return true;
  };
  window.wpKeyNext = function() {
      var am = getActiveMap(); if (!am || am.type !== 'map' || state.viewMode !== 'visual') return 'Picking a token works on the play map.';
      var n = window.wpNet, client = !!(n && n.active && n.role === 'client');
      var toks = am.whiteboard.filter(function(x) { return x && (x.isChar || x.waiting) && (client ? x.ownerId === n.myId : !x.waiting); });
      if (!toks.length) return client ? 'You have no token on this map.' : 'There is no character token on this map.';
      var at = -1; toks.forEach(function(x, i) { if (x.id === state.selWbId) at = i; }); var nx = toks[(at + 1) % toks.length];
      state.selWbIds = [nx.id]; state.selWbId = nx.id; render();
      var wrap = document.getElementById('whiteboardWrap'), z = state.zoomLevel || 1;
      if (wrap && typeof centerWrapOn === 'function') centerWrapOn(wrap, nx.x + (nx.w || 60) / 2, nx.y + (nx.h || 52) / 2);   // 1.6.3 (the review of finding 7's fix): centered where a turned view draws it
      else if (wrap) { wrap.scrollLeft = Math.max(0, (nx.x + (nx.w || 60) / 2) * z - wrap.clientWidth / 2); wrap.scrollTop = Math.max(0, (nx.y + (nx.h || 52) / 2) * z - wrap.clientHeight / 2); }
      return true;
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
      if (n && n.active && n.role === 'client' && (n.paused || n.selfPaused || n.selfHeld || n.reconnecting || tok.ownerId !== n.myId || tok.locked)) return null;   // a locked token is frozen for its player (the host refuses it too)
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
      if (net && net.active && net.role === 'client') return item.ownerId === net.myId && !item.locked && !(net.paused || net.selfPaused || net.selfHeld || net.reconnecting);
      return true;
  }
  // [systemcheck:turnable-end]
  // 1.6.2 (backlog 70, the review): a turn gesture of the viewer's own (the token's arrow, the rotate handle) is open from its press to its
  // release. window.wpTurnGesture is when it began, 0 when none is open: a player's app holds its map copy meanwhile (net.js onLocalSave), and
  // an end that sends nothing itself lets a copy that waited go
  function turnGesture(on) {
      window.wpTurnGesture = on === true ? Date.now() : 0;
      if (on === true) return;
      var n = window.wpNet; if (n && n._heldSave === true && typeof n.onLocalSave === 'function') n.onLocalSave();
  }
  function attachArrowTurn() {
      var turning = null;
      function boardPt(e) {
          var wrap = document.getElementById('whiteboardWrap'); var b = wrap.getBoundingClientRect(); var z = state.zoomLevel || 1;
          return { x: wbX(e.clientX, e.clientY, b, wrap), y: wbY(e.clientX, e.clientY, b, wrap) };
      }
      document.addEventListener('pointerdown', function(e) {
          if (e.button !== 0 || !e.target || !e.target.closest) return;
          var ar = e.target.closest('.token-front.turnable');
          if (!ar) return;
          var el = ar.closest('.wb-item'); if (!el) return;
          var am = getActiveMap(); if (!am || am.type !== 'map' || state.viewMode !== 'visual') return;
          var item = am.whiteboard.find(function(x) { return x.id === el.dataset.id; });
          if (!item || !item.isChar) return;
          if (window.wpNet && window.wpNet.active && window.wpNet.role === 'client' && (window.wpNet.paused || window.wpNet.selfPaused || window.wpNet.selfHeld || window.wpNet.reconnecting || item.ownerId !== window.wpNet.myId || item.locked)) return;
          e.preventDefault(); e.stopPropagation();
          turning = { id: item.id, mapId: am.id, sx: e.clientX, sy: e.clientY, moved: false, shift: e.shiftKey };   // fold M8: by id, found again at each write
          turnGesture(true);
      }, true);
      document.addEventListener('pointermove', function(e) {
          if (!turning) return;
          if (!turning.moved && Math.hypot(e.clientX - turning.sx, e.clientY - turning.sy) < 5) return;
          var it = ownTokenNow(turning.mapId, turning.id); if (!it) { turning = null; turnGesture(false); return; }   // no longer theirs to turn: the turn is over
          turning.moved = true;
          var p = boardPt(e);
          var cx = it.x + (it.w || 60) / 2, cy = it.y + (it.h || 52) / 2;
          var deg = Math.atan2(p.y - cy, p.x - cx) * 180 / Math.PI + 90;   // 0 = up, clockwise
          applyFacing(it, deg, e.shiftKey);
          refreshTokenDom(it);
      });
      function turnUp(e) {
          if (!turning) return;
          var tn = turning, it = ownTokenNow(tn.mapId, tn.id); turning = null;
          if (!it) { turnGesture(false); return; }   // fold M8: gone, locked or no longer theirs meanwhile: nothing lands
          window.wpTurnGesture = 0;   // the final goes first, then the save's own copy
          if (!tn.moved) window.wpTurnToken(it, tn.shift ? -1 : 1);
          refreshTokenDom(it);
          if (window.wpNet && window.wpNet.active && window.wpNet.streamPos) window.wpNet.streamPos(it, true, tn.mapId);
          save(); render();
      }
      document.addEventListener('pointerup', turnUp);
      document.addEventListener('pointercancel', function(e) { if (!turning) return; if (!turning.moved) { turning = null; turnGesture(false); return; } turnUp(e); });   // backlog 70: a canceled turn ends as a release does, its final sent; a press that turned nothing turns nothing
  }
  function attachRotateHandle() {

      var handle = document.getElementById('globalRotateHandle');

      if(!handle) return;

      var isRotating = false, item, startAngle, startRot, cx, cy, rotMapId = null;   // fold M8: the map the turn began on; the item found again by id at each write

      handle.addEventListener('pointerdown', function(e) {

          if (!state.selWbId || state.viewMode !== 'visual') return;

          if (window.wpNet && window.wpNet.active && window.wpNet.role === 'client') { var ownTok = getActiveMap().whiteboard.find(x => x.id === state.selWbId); if (window.wpNet.paused || window.wpNet.selfPaused || window.wpNet.selfHeld || window.wpNet.reconnecting || !ownTok || !ownTok.isChar || ownTok.ownerId !== window.wpNet.myId || ownTok.locked) return; }   // players may turn their own token (not one the GM locked)

          item = getActiveMap().whiteboard.find(x => x.id === state.selWbId);

          if (!item) return;

          isRotating = true; rotMapId = getActiveMap().id;

          cx = item.x + (item.w||100)/2;
          cy = item.y + (item.h||100)/2;

          

          var wrapBox = document.getElementById('whiteboardWrap').getBoundingClientRect();

          var mouseX = wbX(e.clientX, e.clientY, wrapBox, document.getElementById('whiteboardWrap'));

          var mouseY = wbY(e.clientX, e.clientY, wrapBox, document.getElementById('whiteboardWrap'));

          

          startAngle = Math.atan2(mouseY - cy, mouseX - cx) * 180 / Math.PI;

          startRot = item.rot || 0;
          turnGesture(true);   // backlog 70: a player's copy waits for the release

          

          try { handle.setPointerCapture(e.pointerId); } catch(_) {}

          hostGestureStart();   // fold M6

          e.preventDefault(); e.stopPropagation();

      });
      handle.addEventListener('pointercancel', hostGestureEnd); handle.addEventListener('lostpointercapture', hostGestureEnd);   // fold M6
      function rotCancel() {   // backlog 70: a turn that ends with no release ends as a release does, its final sent, and holds no copy back (after a release it only lets a held copy go)
          if (isRotating) {
              isRotating = false;
              var liveC = item ? ownTokenNow(rotMapId, item.id) : null;
              if (liveC) { window.wpTurnGesture = 0; if (window.wpNet && window.wpNet.active && window.wpNet.streamPos) window.wpNet.streamPos(liveC, true, rotMapId); save(); render(); }
          }
          turnGesture(false);
      }
      handle.addEventListener('pointercancel', rotCancel); handle.addEventListener('lostpointercapture', rotCancel);

      handle.addEventListener('pointermove', function(e) {

          if (!isRotating) return;

          var wrapBox = document.getElementById('whiteboardWrap').getBoundingClientRect();

          var mouseX = wbX(e.clientX, e.clientY, wrapBox, document.getElementById('whiteboardWrap'));

          var mouseY = wbY(e.clientX, e.clientY, wrapBox, document.getElementById('whiteboardWrap'));

          

          var currentAngle = Math.atan2(mouseY - cy, mouseX - cx) * 180 / Math.PI;

          var diff = currentAngle - startAngle;

          

          var liveR = ownTokenNow(rotMapId, item.id); if (!liveR) { isRotating = false; hostGestureEnd(); turnGesture(false); return; }   // fold M8: no longer theirs to turn
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

          var liveU = ownTokenNow(rotMapId, item.id); if (!liveU) { turnGesture(false); render(); return; }   // fold M8: nothing lands for a token no longer theirs
          item = liveU;
          window.wpTurnGesture = 0;   // backlog 70: the final goes first, then the save's own copy
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

      if (type === 'image' && !item.isChar && typeof groundPic === 'function') groundPic(getActiveMap(), item);   // backlog 231: the first picture on a bare map is its ground, however it is added
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
      if (typeof window !== 'undefined' && window.wpLayout && window.wpLayout.menuFit(menu)) return;   // 1.6.2 (backlog 224): a bar laid on the top or down a side opens its options away from its edge, held inside the map's area
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
  // 1.6.2 (the owner, 2026-11-13: "right clicking on a toolbar button should bring up it's options"): a right-click on a button that has options
  // does what a press of its small arrow does, by sending the arrow that very press, so every rule of the arrow holds: wbOneMenu, menuFront,
  // the arrow's own handler and toolPress. A right-click of the pointer counts as a pointer's press (barPress has heard its pointerdown, so
  // barBehind asks what that pointerdown found), and one by the keyboard's menu key as a key's. The browser's own menu does not open there and
  // the map's right-click menu does not hear it. A button with no options is not wired, so nothing new happens there
  // The review of 2026-11-13: a right-click counts only where its own press began on that very button. Windows ends a right drag with a
  // contextmenu at the place it is let go, so a pan, Fill's erase or the fog brush let go over the bar took a tool. A pointer's press is noted
  // as it goes down (rightDown, heard by the document in the capture phase), a key lets the note go, and rightFrom says what a right-click is:
  // 'ptr' from a press that began on one of the buttons ok names and moved no more than 4 px, 'key' with no pointer's press since the last key
  // (the keyboard's menu key), else '' and nothing is done. Whether it was the pointer's comes from that press and never from e.button, which a
  // touch's long press and the Ctrl+click of a Mac give as 0 (finding 6)
  var _rightOn = null;
  function rightDown(e) { var t = e && e.target; _rightOn = { el: t && typeof t.closest === 'function' ? t.closest('button') : null, x: e && e.clientX, y: e && e.clientY }; }
  function rightFrom(e, ok) {
      var r = _rightOn, num = function(v) { return typeof v === 'number' && isFinite(v); }; _rightOn = null;
      if (!r) return 'key';
      if (!r.el || !ok(r.el)) return '';
      if (num(r.x) && num(r.y) && e && num(e.clientX) && num(e.clientY) && Math.max(Math.abs(e.clientX - r.x), Math.abs(e.clientY - r.y)) > 4) return '';
      return 'ptr';
  }
  function rightPress(e, to, how) {
      if (!e || !to || typeof to.dispatchEvent !== 'function' || !how) return false;
      if (typeof e.preventDefault === 'function') e.preventDefault();
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
      var init = { bubbles: true, cancelable: true, detail: how === 'ptr' ? 1 : 0, button: 0 };
      to.dispatchEvent(typeof MouseEvent === 'function' ? new MouseEvent('click', init) : Object.assign({ type: 'click' }, init));
      return true;
  }
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
      // the right-click: on a pair's icon or its arrow, the arrow's press; on More, Pages, Link and Center, the button's own; on Select and Pan, the mark that switches them
      Array.prototype.forEach.call(document.querySelectorAll('.tool-pair'), function(pair) {
          var icon = pair.querySelector('.wb-tool-btn'), chev = pair.querySelector('.tool-chev');
          if (!icon || !chev) return;
          pair.addEventListener('contextmenu', function(e) { var hit = e && e.target && typeof e.target.closest === 'function' ? e.target.closest('button') : null; if (hit === icon || hit === chev) rightPress(e, chev, rightFrom(e, function(b) { return b === icon || b === chev; })); });
      });
      Object.keys(MENU_BTNS).forEach(function(id) { var btn = document.getElementById(id); if (btn) btn.addEventListener('contextmenu', function(e) { rightPress(e, btn, rightFrom(e, function(b) { return b === btn; })); }); });
      var swap = document.getElementById('selSwap'), swapBtn = document.getElementById('selSwapBtn');
      if (swap && swapBtn) swap.addEventListener('contextmenu', function(e) { rightPress(e, swapBtn, rightFrom(e, function(b) { for (var n = b; n; n = n.parentElement) if (n === swap) return true; return false; })); });
      if (typeof document.addEventListener === 'function') { document.addEventListener('pointerdown', rightDown, true); document.addEventListener('keydown', function() { _rightOn = null; }, true); }
  }
  wireMenuArrows();
  // [lookcheck:press-end]
  // [lookcheck:menuinview-start]
  // 1.6.2 (backlog 59 i; the owner: "Find and fix the rest (Recommended)"): a menu of the map's bars is held inside the window sideways, so one whose
  // button stands near an edge is never cut off there (Scene's effects ran 10 px past the right edge at 1024 px). It moves by the translate
  // property, which adds to the transform a menu is centered by, and is taken off as the menu closes
  function menuInView(menu, win) {
      if (!menu || !menu.style || typeof menu.getBoundingClientRect !== 'function') return 0;
      menu.style.translate = '';
      var r = menu.getBoundingClientRect(), w = win && win.innerWidth; if (!r || !(r.width > 0) || !(w > 0)) return 0;
      var dx = r.width > w - 16 || r.left < 8 ? 8 - r.left : r.right > w - 8 ? (w - 8) - r.right : 0;
      dx = Math.round(dx); if (dx) menu.style.translate = dx + 'px 0';
      return dx;
  }
  function menusInView(doc, win, MO) {   // each menu of the three bars, as it opens and as the window changes size
      if (!doc || typeof doc.querySelectorAll !== 'function' || !win) return 0;
      var ms = doc.querySelectorAll('#wbFloatingToolbar .shape-menu, #wbEdgeTools .shape-menu, #dataFloatingToolbar .shape-menu');
      var fit = function(m) { if (m.classList.contains('show')) menuInView(m, win); else if (m.style.translate) m.style.translate = ''; };
      if (typeof MO === 'function') { var ob = new MO(function(list) { list.forEach(function(x) { fit(x.target); }); }); Array.prototype.forEach.call(ms, function(m) { ob.observe(m, { attributes: true, attributeFilter: ['class'] }); }); }
      if (typeof win.addEventListener === 'function') win.addEventListener('resize', function() { Array.prototype.forEach.call(ms, fit); });
      return ms.length;
  }
  // [lookcheck:menuinview-end]
  if (typeof document !== 'undefined' && typeof window !== 'undefined') menusInView(document, window, window.MutationObserver);
  function updateWbToolbar(activeId) {
      ['moveModeBtn', 'panModeBtn', 'drawModeBtn', 'eraserModeBtn', 'measureModeBtn', 'blastModeBtn', 'fogModeBtn', 'fillModeBtn', 'buildModeBtn', 'envModeBtn'].forEach(id => {
          var el = document.getElementById(id);
          if (el) el.classList.remove('active');
      });
      var el = document.getElementById(activeId);
      if (el) el.classList.add('active');
      // The hand tool pans no matter what it grabs — items are untouchable while it's active
      window.isPanMode = (activeId === 'panModeBtn');
      var swp = document.getElementById('selSwap'); if (swp && (activeId === 'panModeBtn' || activeId === 'moveModeBtn')) swp.classList.toggle('on-pan', activeId === 'panModeBtn');   // 1.6.0: Select and Pan share one place, and it shows the one last taken, whatever took it
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
      if (window.wpDrawShow) window.wpDrawShow.sync();   // 1.6.2: On the map or To show, and how long it stays
  }

  var _el_selSwapBtn = document.getElementById('selSwapBtn');
  if(_el_selSwapBtn) _el_selSwapBtn.addEventListener('click', function(e) { e.stopPropagation(); var sw = document.getElementById('selSwap'), to = document.getElementById(sw && sw.classList.contains('on-pan') ? 'moveModeBtn' : 'panModeBtn'); if (to) to.click(); });   // 1.6.0 (the owner: "we can put the pan and arrow in a switchable selection together"): the small arrow takes the other one
  if(_el_moveModeBtn) _el_moveModeBtn.addEventListener('click', function() {
      window.isDrawingMode = false;
      window.isEraserMode = false;
      window.isMeasureMode = false;
      var wbWrap = document.getElementById('whiteboardWrap');
      if(wbWrap) wbWrap.style.cursor = 'default';
      updateWbToolbar('moveModeBtn');
      closeDrawMenu();
  });
  // Select is the tool in hand when the app opens, so the body says so from the start (mode-move), as it does once any tool is taken
  // (updateWbToolbar). Before this the class came only with the first press of a tool: the map's Select cursor was missing until then, and
  // the token card (backlog 236), which takes presses only with Select in hand (style.css body:not(.mode-move) #wbTooltip.tc-on), could not
  // be pressed at all on a fresh launch. Found live on 2026-11-14 at the review of the hover card's merge
  if (typeof document !== 'undefined' && document.body && !/(^|\s)mode-/.test(document.body.className)) document.body.classList.add('mode-move');

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
          eraserCursorAt(wbX(e.clientX, e.clientY, box, wbWrap), wbY(e.clientX, e.clientY, box, wbWrap));
      });
      wbWrap.addEventListener('pointerleave', function() { if (_eraserCursor) _eraserCursor.style.display = 'none'; });
  }

  /* ---- image frame fitting ----
     Images draw with object-fit: contain, so a box with the wrong proportions
     leaves invisible margins the handles still measure. On load, a non-token
     image whose box is off by more than 1.5% gets its height corrected once
     (`fit` flag); Lock proportions is on by default (lockRatio absent), so the shape then holds
     unless the GM freed it. */
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
     Click one to jump to that character: their map (if different), centered on them at 150%. */
  var FOCUS_ZOOM = 1.5;
  function wbHashHue(s) { var h = 0, t = String(s); for (var i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return ((h % 360) + 360) % 360; }   // a stable per-key hue for the no-picture silhouette default
  var PARTY_SHOWN = 4;   // as the Maps list's faces (sidebar.js PRES_SHOWN)
  function renderPartyStrip() {
      if (window.wpJoinCard) window.wpJoinCard.check();   // Onboarding F1a: a player's join card follows their waiting token
      var strip = document.getElementById('partyStrip'); if (!strip) return;
      var camp = getActiveCampaign(), am = getActiveMap();
      if (!camp || !am || am.type !== 'map' || state.viewMode !== 'visual') { strip.innerHTML = ''; strip.dataset.sig = ''; return; }
      var list = characterList(camp, true, am.id, function(pid) { return playerNow(camp, pid); }).map(function(c) { return chipPlace(camp, c); });   // a player's chip is the token on the map they are on
      // [sinkcheck:partyface-start]
      list.forEach(function(c) { if (c.src || !c.face || !window.wpNet || !window.wpNet.faceView || !window.wpNet.cleanFace || !window.wpNet.cleanFace(c.face)) return; var fvT = window.wpNet.faceView({ face: c.face }, cssColor(c.tcolor || '#4db3d3')); if (fvT.emoji) c.emoji = fvT.emoji; else if (fvT.img) { c.src = fvT.img; c.avatar = true; } });   // Onboarding F1c: a character's own face (an emoji, a bundled picture, the default in its token's color)
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
              var fvP = window.wpNet && window.wpNet.faceView ? window.wpNet.faceView(p, p.color || '#4db3d3') : null;   // the waiting token's color when they have none   // Onboarding F1b: their chosen face
              var locMap = p.location && camp.items[p.location];
              // 1.6.3 (the improvement week's review of multiplayer, finding 29): on a player's app a map they are not on is held only as a stub,
              // whose pieces are not sent, so a teammate there is never found by their token. Such a chip says where the roster puts them and
              // names the character the app knows they play (stubPlays), and never says they have no token yet, which it cannot tell
              var stubL = !!(locMap && locMap.stub === true), playsL = stubL ? stubPlays(camp, p.id) : '';
              list.push({ key: 'p:' + p.id, ownerId: p.id, tokId: null, name: playsL || (window.wpNet && typeof window.wpNet.playerName === 'function' ? window.wpNet.playerName(p.id, p.name || 'Player') : (p.name || 'Player')), src: fvP ? (fvP.img || null) : (avOk ? p.avatar : null), emoji: fvP && fvP.emoji ? fvP.emoji : null, avatar: true, color: p.color || null, waiting: !!(window.wpSystemCore && window.wpSystemCore.waitingTokensOf && window.wpSystemCore.waitingTokensOf(camp, p.id).length),
                          mapId: p.location || null, map: locMap && locMap.meta && locMap.meta.title || 'no map yet', noToken: !stubL });
          });
      }
      // Onboarding F3 (the GM's): by the chip's player — one of theirs waiting for Keep it, one unlocked for them, one they are making (the
      // flagged character may be kept, with no token of its own, while the chip is the token of the one they play: the tip names it)
      if (hosting && camp.chars) list.forEach(function(c) {
          var hit = function(k) { var found = null; if (c.ownerId) Object.keys(camp.chars).some(function(id) { var x = camp.chars[id]; if (x && typeof x === 'object' && !x.npc && x.ownerId === c.ownerId && x[k] === 1) { found = x; return true; } return false; }); return found; };
          var fx = hit('review'), fl = fx ? 'review' : (fx = hit('unlocked')) ? 'unlocked' : (fx = hit('making')) ? 'making' : '';
          c.flag = fl; c.flagName = fx && typeof fx.name === 'string' ? fx.name : '';
      });
      // 1.6.3 (the improvement week's review, finding 26): a member's hover lines are worked out ONCE a draw (hlOf, kept on the member as c.hl)
      // and read by both the strip's signature and the chip's tooltip below, which each asked for them before. The lines are the same: one ask.
      // tokIx is this draw's own: sheets.js keeps on it where each token stands, made once for every member's ask, and it goes with the draw
      var tokIx = {};
      var hlOf = function(c) { if (c.hl === undefined) c.hl = window.wpSheets && c.tokId ? window.wpSheets.hoverLinesForTokenId(camp, c.tokId, tokIx) : []; return c.hl; };
      var sig = list.map(function(c) { return c.key + (c.flag ? '~' + c.flag + '~' + c.flagName : '') + (c.waiting ? '~w' : '') + (c.emoji ? '~' + c.emoji : '') + '|' + c.name + '|' + c.mapId + '|' + (c.src ? c.src.length + c.src.slice(-16) : '') + '|' + (atTable ? (present[c.ownerId] ? 1 : 0) : 2) + '|' + (window.wpSheets && c.tokId ? hlOf(c).join(',') : '') + '|' + (hosting && c.ownerId && window.wpNet.isPlayerPaused && window.wpNet.isPlayerPaused(c.ownerId) ? 'P' : ''); }).join(';') + '#' + am.id;
      if (strip.dataset.sig === sig) return;
      strip.dataset.sig = sig;
      if (list.length > PARTY_SHOWN) strip.dataset.more = String(list.length - PARTY_SHOWN); else delete strip.dataset.more;   // on a narrow map area the style sheet shows four faces and this count, and all of them under the pointer
      strip.innerHTML = list.map(function(c) {
          var here = c.mapId === am.id;
          var away = atTable && c.ownerId && !present[c.ownerId];
          var pausedC = hosting && c.ownerId && window.wpNet.isPlayerPaused && window.wpNet.isPlayerPaused(c.ownerId);
          var cls = 'party-tok' + (here ? ' here' : '') + (away ? ' away' : '') + (pausedC ? ' paused' : '') + (c.waiting ? ' party-waiting' : '') + (c.flag ? ' party-' + c.flag : '');
          var tip = c.name + (here ? ' \u2014 on this map' : ' \u2014 on ' + c.map) + (away ? ' (player not connected)' : '') + (pausedC ? ' \u2014 PAUSED by you' : '') + (c.flag === 'making' ? ' \u2014 making ' + (c.flagName || 'a character') : c.flag === 'review' ? ' \u2014 ' + (c.flagName || 'a character') + ' is new: review it on its sheet' : c.flag === 'unlocked' ? ' \u2014 ' + (c.flagName || 'a character') + ' is unlocked for its player' : '') + (c.noToken ? (c.waiting ? ' \u2014 waiting for a character' : ' \u2014 no token yet') : '') + (atTable && !hosting ? (here ? '. Click to find them.' : '') : '. Click to jump to them.');
          if (window.wpSheets && c.tokId) { var hlT = hlOf(c); if (hlT.length) tip += String.fromCharCode(10) + hlT.join(' · '); }   // 1.6.3 (finding 26): the lines the signature already asked for
          if (c.emoji) return '<span class="' + cls + ' party-face party-emoji" data-key="' + esc(c.key) + '" data-tip="' + esc(tip) + '">' + esc(c.emoji) + '</span>';   // Onboarding F1b: an emoji face (pictographic only, net.js cleanFace)
          if (c.src) return '<img class="' + cls + (c.noToken ? ' party-face' : '') + '" data-key="' + esc(c.key) + '" src="' + esc(c.avatar ? c.src : resolveImg(c.src)) + '" alt="" data-tip="' + esc(tip) + '">';
          var pcol = c.color || ('hsl(' + wbHashHue(c.key) + ',55%,55%)');   // no picture → the color-tinted silhouette default
          return '<img class="' + cls + (c.noToken ? ' party-face' : '') + '" data-key="' + esc(c.key) + '" src="' + (window.wpDefaultAvatar ? window.wpDefaultAvatar(pcol) : '') + '" alt="" data-tip="' + esc(tip) + '">';
      }).join('');
  }
  window.wpRenderPartyStrip = renderPartyStrip;
  // [hudcheck:stubplays-start]
  // 1.6.3 (finding 29): the name of the character a player plays, as this app knows it: the first sheet of theirs it holds (a teammate's
  // hover copy on a player's app) that is no NPC and not still being made, else ''. Read only for a teammate on a map held as a stub
  function stubPlays(camp, pid) {
      var cs = camp && camp.chars && typeof camp.chars === 'object' ? camp.chars : null; if (!cs || typeof pid !== 'string' || !pid) return '';
      var ks = Object.keys(cs);
      for (var i = 0; i < ks.length; i++) { var x = cs[ks[i]]; if (x && typeof x === 'object' && x.ownerId === pid && !x.npc && x.making !== 1 && typeof x.name === 'string' && x.name.trim()) return x.name.trim().slice(0, 60); }
      return '';
  }
  // [hudcheck:stubplays-end]
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
              var r = n.charToken(String(nm), function(a) { toast(a.error || (a.charId ? 'You play at once. Its sheet is yours to fill in when you like (press Done when it is finished).' : 'You play at once with your own token.')); });
              if (r && r.error) toast(r.error);
          }, { name: 'person' });
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
  // 1.6.0 (the owner, by prompt: "Ask first"): the map a press on a party portrait would take the GM to, by focusCharacter's own reading
  function focusMapOf(camp, key) {
      var wl = waitingLoc(camp, key);
      if (key.charAt(0) === 'p' && !wl) { var pl = Object.values((window.wpNet && window.wpNet.roster) || {}).find(function(p) { return p && p.id === key.slice(2); }); return pl && pl.location ? pl.location : ''; }
      var now = wl ? null : charNow(camp, key), loc = wl || now.loc;
      return loc ? loc.map.id : now && now.sure ? now.at : '';
  }
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
          toast(pl.name + ' is on this map but has no token yet. Give them one from a character token\'s Properties.');
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
  // 1.6.2 (the owner: a press on a face in a map's hover list jumps to that player on the map they are on): their token on that very map,
  // the character they play before any other, centered and selected; with none of theirs there, the map, and a word. Never a waiting token
  function focusPlayerOn(pid, mapId, name) {
      var camp = getActiveCampaign(), m = camp && typeof mapId === 'string' ? camp.items[mapId] : null;
      if (!m || m.type !== 'map' || typeof pid !== 'string' || !pid) return false;
      var wb = m.whiteboard || [], mine = function(x) { return x && x.isChar && !x.waiting && x.ownerId === pid; };
      var tok = wb.find(function(x) { return mine(x) && !x.hidden && x.charId; }) || wb.find(function(x) { return mine(x) && !x.hidden; }) || wb.find(mine);
      var nm = String(name || (tok && (tok.charName || tok.name)) || 'That player');
      if (camp.activeItemId !== mapId) { camp.activeItemId = mapId; updateSidebarNav(); }
      state.viewMode = 'visual';
      if (tok) { m.meta = m.meta || {}; m.meta.lastWbX = tok.x + (tok.w || 60) / 2; m.meta.lastWbY = tok.y + (tok.h || 52) / 2; m.meta.lastWbZoom = FOCUS_ZOOM; state.selWbId = tok.id; state.selWbIds = [tok.id]; }
      render();
      if (window.appRestoreCamera) window.appRestoreCamera();
      save();
      toast(tok ? 'Focused on ' + (tok.charName || tok.name || nm) + '.' : nm + ' is on this map with no token of theirs to show.');
      return true;
  }
  window.wpFocusPlayerOn = focusPlayerOn;
  (function wirePartyStrip() {
      var strip = document.getElementById('partyStrip'); if (!strip) return;
      strip.addEventListener('click', function(e) {
          var tok = e.target.closest && e.target.closest('.party-tok'); if (!tok) return;
          if (strip.dataset.justDragged) return;   // that was a drag onto the map, not a click
          e.stopPropagation();
          if (window.wpStream && window.wpStreamFocusChar) { window.wpStreamFocusChar(tok.dataset.key); return; }
          var campF = getActiveCampaign(), keyF = tok.dataset.key, toF = campF && !(window.wpNet && window.wpNet.active && window.wpNet.role === 'client') ? focusMapOf(campF, keyF) : '';
          if (toF && toF !== campF.activeItemId && campF.items[toF]) { showConfirm('Go to ' + ((campF.items[toF].meta || {}).title || 'that map') + '? That is where this character is.', function(yes) { if (yes) focusCharacter(keyF); }); return; }
          focusCharacter(keyF);
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
          bringKeyHere(d.key, wbX(e.clientX, e.clientY, wr, wrap), wbY(e.clientX, e.clientY, wr, wrap));
          strip.dataset.justDragged = '1'; setTimeout(function() { delete strip.dataset.justDragged; }, 300);
      });
      var menu = document.getElementById('partyMenu');
      function closePartyMenu() { if (menu) menu.classList.remove('show'); }
      strip.addEventListener('contextmenu', function(e) {
          var tok = e.target.closest && e.target.closest('.party-tok'); if (!tok || !menu) return;
          e.preventDefault(); e.stopPropagation();
          openPartyMenu(tok.dataset.key, e.clientX, e.clientY);
      });
      // [boardcheck:partywho-start]
      // 1.6.3 (the improvement week's review of multiplayer, finding 36; Fulllion, 2026-11-21: the party chip's menu names the player for player
      // actions, "Pause Mira (HK-24)"). The rows that act on the PERSON (summon, pause or resume, clear their target, hide the trackers) name the
      // player, with the character beside it in brackets where the chip is a character of theirs; the rows that act on the character (jump,
      // sheet, HUD, bring) keep the character's name. The player's name is the roster's, else their record in this campaign; where neither is
      // known, every row says what it said before. who: for a row's words, whoS: before 's, hideW: the trackers row's ending
      function partyWho(camp, ownerId, rosterP, name, isChar) {
          var rec = ownerId && camp && camp.players && typeof camp.players === 'object' && Object.prototype.hasOwnProperty.call(camp.players, ownerId) ? camp.players[ownerId] : null;
          var pn = (rec && typeof rec.gmName === 'string' && rec.gmName.trim()) || (rosterP && typeof rosterP.name === 'string' && rosterP.name.trim()) || (rec && typeof rec.name === 'string' && rec.name.trim()) || '';   // 1.6.4: the GM's own name for them first (Player History)
          return { who: pn ? (isChar && name && name !== pn ? pn + ' (' + name + ')' : pn) : name, whoS: pn || name, hideW: pn || 'them' };
      }
      // [boardcheck:partywho-end]
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
          var pw = partyWho(camp, ownerId, rosterP, name, !!loc);   // 1.6.3 (finding 36): the player's own name on the rows that act on them
          var hosting = window.wpNet && window.wpNet.active && window.wpNet.role === 'host';
          var connected = hosting && ownerId && window.wpNet.isConnected(ownerId);
          var here = !!(atM && am && atM.id === am.id);
          var items = [];
          var whereName = atM ? (atM.meta && atM.meta.title || 'their map') : (rosterP && rosterP.location && camp.items[rosterP.location] && camp.items[rosterP.location].meta && camp.items[rosterP.location].meta.title) || 'their map';
          var isClientM = window.wpNet && window.wpNet.active && window.wpNet.role === 'client' && !window.wpStream;
          if (isClientM && !here) items.push({ act: 'none', label: name + ' \u2014 on ' + whereName, dim: true });
          else items.push({ act: 'jump', ico: 'target', label: (isClientM ? 'Find ' : 'Jump to ') + name + (here ? '' : ' (' + whereName + ')') });
          if (hosting && ownerId) {
              var stagedId = window.wpNet.stagedMapId ? window.wpNet.stagedMapId() : null;
              var viewingOther = am && am.type === 'map' && stagedId && stagedId !== am.id;   // GM is looking at a different map than the table's pinned one
              var amTitle = (am && am.meta && am.meta.title) || 'this map';
              var stagedTitle = (stagedId && camp.items[stagedId] && camp.items[stagedId].meta && camp.items[stagedId].meta.title) || null;
              var tableSfx = (viewingOther && stagedTitle) ? ' (' + stagedTitle + ')' : '';
              items.push(connected
                  ? { act: 'summon', ico: 'summon', label: 'Summon ' + pw.who + ' to the table\'s map' + tableSfx }
                  : { act: 'none', ico: 'summon', label: 'Summon ' + pw.who + ' \u2014 not connected', dim: true });
              if (viewingOther && connected) items.push({ act: 'summonHere', ico: 'summon', label: 'Summon ' + pw.who + ' to this map (' + amTitle + ')' });
              items.push({ act: 'summonAll', ico: 'summon', label: 'Summon everyone to the table\'s map' + tableSfx });
              if (viewingOther) items.push({ act: 'summonAllHere', ico: 'summon', label: 'Summon everyone to this map (' + amTitle + ')' });
              var waitT = ownerId && window.wpSystemCore && window.wpSystemCore.waitingTokensOf ? window.wpSystemCore.waitingTokensOf(camp, ownerId)[0] : null;   // Onboarding F1a
              if (waitT) { items.push({ act: 'waitHide', ico: waitT.w.hidden ? 'seen' : 'unseen', label: (waitT.w.hidden ? 'Show ' : 'Hide ') + name + '\u2019s waiting token' }); items.push({ act: 'waitRemove', ico: 'close', label: 'Remove ' + name + '\u2019s waiting token (for this session)' }); }
              if (!window.wpStream && window.wpNet.targets && Object.prototype.hasOwnProperty.call(window.wpNet.targets, ownerId) && window.wpNet.targets[ownerId] && typeof window.wpNet.clearTargetOf === 'function') items.push({ act: 'clearTarget', ico: 'ring', label: 'Clear ' + pw.whoS + '\u2019s target' });   // 1.5.9: the GM takes a player's pointer off (the label through esc, as every row's)
              if (connected) {
                  var pausedP = window.wpNet.isPlayerPaused && window.wpNet.isPlayerPaused(ownerId);
                  items.push({ act: pausedP ? 'unpausePlayer' : 'pausePlayer', ico: pausedP ? 'play' : 'pause', label: (pausedP ? 'Resume ' : 'Pause ') + pw.who });
              }
          }
          var isClient = window.wpNet && window.wpNet.active && window.wpNet.role === 'client';
          if (!isClient && ownerId && !window.wpStream && window.wpTrackers && window.wpTrackers.on && window.wpTrackers.on()) items.push({ act: 'trkHide', label: (window.wpTrackers.hidden(ownerId) ? '\u2611 ' : '\u2610 ') + 'Hide table trackers from ' + pw.hideW });   // backlog 29: the owner, "gm but for the whole table or specific players"
          if (!isClient && am && am.type === 'map' && !(hosting && connected)) items.push({ act: 'bring', ico: 'bring', label: 'Bring ' + name + ' here (this map)' });
          if (window.wpNet && window.wpNet.active && !hosting && !window.wpStream) items.push({ act: 'target', ico: 'target', label: 'Target ' + name });
          if (loc && loc.tok && window.wpSheets && (!isClient ? true : (loc.tok.charId && window.wpSheets.canOpen(loc.tok.charId)))) items.push({ act: 'sheet', ico: 'clip', label: (loc.tok.charId ? 'Sheet\u2026' : 'New character sheet\u2026') });   // character sheets (1.5.0)
          if (loc && loc.tok && loc.tok.charId && window.wpSheets && window.wpSheets.hudFor && window.wpSheets.hudFor(loc.tok.charId)) items.push({ act: 'hud', ico: 'hud', label: 'HUD\u2026' });   // HUD frame (HF2b)
          if (!isClient && ownerId && window.wpSheets && window.wpSheets.giveCharacter && camp && camp.system && giveList(camp, ownerId).length) items.push({ act: 'give', ico: 'mask', label: 'Give a character\u2026' });   // Onboarding F0: give, switch the one in play, or put its token here
          if (!isClient && window.wpSheets) items.push({ act: 'chars', ico: 'people', label: 'Characters\u2026' });
          if (!isClient && ownerId && window.wpSheets && window.wpSheets.inviteMaking && camp && camp.system && window.wpSystemCore && window.wpSystemCore.newCharRules && window.wpSystemCore.newCharRules(camp, !window.wpVtt || !window.wpVtt.rulesOn || window.wpVtt.rulesOn('sheets') !== false).create !== 'off' && !Object.keys(camp.chars || {}).some(function(k) { var x = camp.chars[k]; return x && x.ownerId === ownerId && x.making === 1; })) items.push({ act: 'invite', ico: 'note', label: 'Let them make a character' });   // Onboarding F3b: the GM's invite (or a replacement for one they play)
          if (isClientM && ownerId && ownerId === window.wpNet.myId && window.wpJoinCard && window.wpJoinCard.has && window.wpJoinCard.has()) items.push({ act: 'joinCard', ico: 'people', label: 'My character\u2026' });   // Onboarding F3: their own card again (a waiting token, one they are making, or one to make)
          fillPartyMenu(items, key);
          menu.classList.add('show');
          window.wpClampMenu(menu, cx, cy);
      }
      window.wpPartyMenuFor = openPartyMenu;
      function fillPartyMenu(items, key) {
          menu.innerHTML = items.map(function(i) {
              return '<button class="wb-tool-btn party-menu-item' + (i.dim ? ' dim' : '') + '" data-act="' + i.act + '" data-key="' + esc(key) + '"' + (i.cid ? ' data-cid="' + esc(i.cid) + '"' : '') + ' style="width:100%; border-radius:0; font-size:12px; height:auto; padding:8px 10px; text-align:left;">' + (i.ico ? '<i class="wib wi-' + i.ico + '"></i> ' : '') + esc(i.label) + '</button>';
          }).join('');
      }
      // Onboarding F0: what the GM can give a player — their own characters first (the one they play: its token onto their map; a kept one:
      // play it now), then the unassigned ones, then other players' (a reassignment). Never an NPC.
      var _givePic = true;   // Onboarding F1c: a character with no picture takes a copy of its player's face (the GM may untick it)
      function giveList(camp, pid) {
          var S = window.wpSystemCore; if (!S || !S.activeCharOf || !camp || !camp.chars) return [];
          var act = S.activeCharOf(camp, pid).id, names = {}, out = [];
          Object.keys(camp.players || {}).forEach(function(k) { var r = camp.players[k]; if (r && typeof r.gmName === 'string' && r.gmName) names[k] = r.gmName; else if (r && typeof r.name === 'string') names[k] = r.name; });   // 1.6.4: the GM's own name first
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
              if (chT.ownerId && chT.ownerId !== pidT) showConfirm('Give ' + chT.name + ' to ' + ((campT.players && Object.prototype.hasOwnProperty.call(campT.players, pidT) && campT.players[pidT] && ((typeof campT.players[pidT].gmName === 'string' && campT.players[pidT].gmName.trim()) || campT.players[pidT].name)) || 'this player') + '? Their current player loses it: its sheet closes for them, and its tokens go to the new player.', function(yes) { if (yes) doGive(); });
              else doGive();
              return;
          }
          if (act === 'jump') { if (window.wpStream && window.wpStreamFocusChar) window.wpStreamFocusChar(key); else focusCharacter(key); }
          else if (act === 'summon') { window.wpNet.summonPlayerById(key.slice(2)); }
          else if (act === 'summonHere') { var amH = getActiveMap(); if (amH && amH.type === 'map' && window.wpNet.summonPlayerToMap) window.wpNet.summonPlayerToMap(key.slice(2), amH.id); }
          else if (act === 'summonAll') { window.wpNet.summonAll(); }
          else if (act === 'summonAllHere') { var amA = getActiveMap(); if (amA && amA.type === 'map' && window.wpNet.summonAllToMap) window.wpNet.summonAllToMap(amA.id); }
          else if (act === 'waitHide') { var cWt = getActiveCampaign(), tWt = cWt && window.wpSystemCore && window.wpSystemCore.waitingTokensOf ? window.wpSystemCore.waitingTokensOf(cWt, key.slice(2))[0] : null; if (tWt && window.wpNet.hideWaiting) window.wpNet.hideWaiting(key.slice(2), !tWt.w.hidden); }   // Onboarding F1a
          else if (act === 'waitRemove') { if (window.wpNet.removeWaiting && window.wpNet.removeWaiting(key.slice(2))) toast('Waiting token removed for this session. Give a character\u2026 still works.'); }
          else if (act === 'clearTarget') { if (window.wpNet.clearTargetOf) window.wpNet.clearTargetOf(key.slice(2)); }   // 1.5.9: the host's alone (clearTargetOf answers nothing elsewhere)
          else if (act === 'pausePlayer') { if (window.wpNet.pausePlayer) window.wpNet.pausePlayer(key.slice(2), true); }
          else if (act === 'unpausePlayer') { if (window.wpNet.pausePlayer) window.wpNet.pausePlayer(key.slice(2), false); }
          else if (act === 'trkHide') { var pidK = key.slice(2); if (window.wpTrackers && window.wpTrackers.setHidden(pidK, !window.wpTrackers.hidden(pidK))) toast(window.wpTrackers.hidden(pidK) ? 'Table trackers hidden from this player.' : 'This player sees the table\u2019s trackers again.'); }
          else if (act === 'joinCard') { if (window.wpJoinCard) window.wpJoinCard.show(); }
          else if (act === 'invite') { if (window.wpSheets && window.wpSheets.inviteMaking) window.wpSheets.inviteMaking(key.slice(2)); }
          else if (act === 'bring') { var ctrB = viewCentre(); bringKeyHere(key, ctrB.x, ctrB.y); }
          else if (act === 'sheet') { var campS = getActiveCampaign(), nS = charNow(campS, key), locS = nS.loc || nS.left; if (locS && locS.tok && window.wpSheets) { if (!locS.tok.charId && !(window.wpNet && window.wpNet.active && window.wpNet.role === 'client')) window.wpSheets.newFromToken(locS.tok); if (locS.tok.charId) window.wpSheets.openSheet(locS.tok.charId); } }
          else if (act === 'hud') { var campH = getActiveCampaign(), nH = charNow(campH, key), locH = nH.loc || nH.left; if (locH && locH.tok && locH.tok.charId && window.wpSheets && window.wpSheets.openHud) window.wpSheets.openHud(locH.tok.charId); }   // HUD frame (HF2b)
          else if (act === 'chars') { if (window.wpSheets && window.wpSheets.openChars) window.wpSheets.openChars(); }   // 1.6.2 (backlog 59 f): Manage characters
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
          + '<div class="menu-item cm-target" title="' + (mine ? 'Stop targeting it (Esc does too)' : 'Mark it as your target: everyone sees a small copy of your token on it (T while pointing at a token does the same)') + '">' + (mine ? '<i class="wib wi-ring"></i> Clear target' : '<i class="wib wi-target"></i> Target') + '</div>';
      cMenu.style.display = 'flex';
      placeMenu(cMenu, e);
      var row = cMenu.querySelector('.cm-target'); if (row) row.addEventListener('click', function(ce) { ce.stopPropagation(); cMenu.style.display = 'none'; toggleTarget(tok, mapId); });
      if (tok.boxed === 1 && window.wpBoxes && typeof window.wpBoxes.ask === 'function') { var srow = document.createElement('div'); srow.className = 'menu-item cm-search'; srow.title = 'Look through what it carries, with a token of yours next to it'; var sic = document.createElement('i'); sic.className = 'wib wi-chest'; srow.appendChild(sic); srow.appendChild(document.createTextNode(' Search the body')); srow.addEventListener('click', function(ce) { ce.stopPropagation(); cMenu.style.display = 'none'; window.wpBoxes.ask(tok.id); }); cMenu.appendChild(srow); }   // 1.6.2 (backlog 42, fold 3): the owner picked both, this row and the chest
      if (tok.boxed !== 1 && !tok.ownerId && window.wpBoxes && typeof window.wpBoxes.stealOn === 'function' && window.wpBoxes.stealOn()) { var prow = document.createElement('div'); prow.className = 'menu-item cm-steal'; prow.title = 'Try to pick its pocket, with a token of yours next to it. Your roll, then its own'; var pic = document.createElement('i'); pic.className = 'wib wi-mask'; prow.appendChild(pic); prow.appendChild(document.createTextNode(' Pickpocket')); prow.addEventListener('click', function(ce) { ce.stopPropagation(); cMenu.style.display = 'none'; window.wpBoxes.steal(tok.id); }); cMenu.appendChild(prow); }   /* 1.6.2 (backlog 42, fold 3b): the owner, A. Right-click an NPC next to them */
      if (typeof tradeRowInto === 'function') tradeRowInto(cMenu, tok);   // 1.5.6 trading: Trade with, for the character they play on this map
      return true;
  }
  // [sinkcheck:targetmenu-end]
  // 1.5.6 trading: a row that asks to trade, made by name with its words as text (trade.js judges who may ask whom)
  function tradeRowInto(cMenu, tok, sel) {
      var T = window.wpTrade, am = typeof getActiveMap === 'function' ? getActiveMap() : null, q = T && T.canAsk ? T.canAsk(tok, am, sel || null) : null; if (!q) return false;
      var r = document.createElement('div'); r.className = 'menu-item cm-trade wib wi-trade'; r.title = 'Open a barter window with them: each side puts items and money on the table, and both confirm'; r.textContent = q.label;
      r.addEventListener('click', function(ce) { ce.stopPropagation(); cMenu.style.display = 'none'; T.ask(q.from, q.to); });
      cMenu.appendChild(r); return true;
  }
  // 1.6.4 (Fulllion's ruling of 2026-11-23, "Side pick + arrival marker"): an Arrive here marker (a piece of type 'arrive') is a small dashed
  // ring with its name under it, on the GM's screen alone: the host sends it to nobody (net.js wireWbItem), so no player's board ever holds one.
  // A portal names it in Properties' Leads to, and net.js doorWayOf sets its travelers down beside it. The name is set as text, never as markup
  function arriveDraw(el, item) {
      el.classList.add('wb-arrive');
      var lb = el.querySelector(':scope > .wb-arrive-name');
      if (!lb) { el.textContent = ''; lb = document.createElement('span'); lb.className = 'wb-arrive-name'; el.appendChild(lb); }
      var nm = String(typeof item.name === 'string' ? item.name : '').trim().slice(0, 80) || 'Arrive here';
      if (lb.textContent !== nm) lb.textContent = nm;
  }
  // The ruling's arrow on a door: where the GM picked the side a door lands its travelers on (Properties' Lands on, the door's landSide), a small
  // arrow in the door's middle points that way, on the GM's own screen (on = a door, and not a player's app or the stream window). It is turned
  // by the door's own axis times the side (fogcore doorAxis, doorFace), less the door's own turn, since the arrow turns with the door it sits in.
  // A door with no side picked wears none. Fixed markup only
  function landArrow(el, item, on) {
      var a = el.querySelector(':scope > .wb-land-arrow'), FC = window.wpFogCore;
      var s = on && FC && typeof FC.cleanLandSide === 'function' ? FC.cleanLandSide(item.landSide) : null, ax = s !== null && typeof FC.doorAxis === 'function' ? FC.doorAxis(item) : null;
      if (!ax) { if (a) a.remove(); return; }
      var deg = FC.doorFace(ax.nx * s, ax.ny * s) - (Number(item.rot) || 0);
      if (!a) { a = document.createElement('div'); a.className = 'wb-land-arrow'; a.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 9h-4.5v9h-5v-9H5z"/></svg>'; a.title = 'Travelers who come in by this door land on this side (Lands on, in its Properties)'; el.appendChild(a); }
      var tf = 'translate(-50%, -50%) rotate(' + deg + 'deg)'; if (a.style.transform !== tf) a.style.transform = tf;
  }
  // Add's Arrive here (#addArriveBtn): the board's placement of a 40 px marker at the next click, the GM's alone (never on a player's app or in
  // the stream window, where the menu's row does nothing)
  (function() {
      var b = document.getElementById('addArriveBtn'); if (!b) return;
      b.addEventListener('click', function() {
          var n = window.wpNet; if (window.wpStream || (n && n.active && n.role === 'client')) return;
          armPlacement('arrive', { w: 40, h: 40, color: '#4fb3a0', name: 'Arrive here' }, 'arrival marker'); if (window.wpPlace) window.wpPlace.sized = true;
          toast('Click the map where travelers should come out. Then name a portal’s Leads to after it.');
      });
  })();
  // How a portal is gone through, in the words its card shows (fixed words, no campaign text). 1.6.4 (doors that lead somewhere): a door that
  // leads somewhere is gone through by walking a token across it (net.js doorCrossFor), so its card says that in place of dropping a token on it
  function portalWayWords(item, client) {
      var FC = window.wpFogCore, door = !!(FC && typeof FC.isDoor === 'function' && FC.isDoor(item));
      if (door) return client ? 'Walk your token through it, or stand next to it and double-click, to travel' : 'Double-click to travel · move a token through it to send it across';
      return client ? 'Drop your token here, or stand next to it and double-click, to travel' : 'Double-click to travel · drop a player\'s token here to send them through';
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
      return '<div class="rc" style="color:var(--gold); font-size:11px;">' + '<i class="wib wi-lock"></i> ' + esc(client === true ? 'Locked \u2014 the GM will unlock it when the time comes' : 'Locked for players \u2014 right-click it to unlock') + '</div>';
  }
  function portalLockRow(items, map) {
      var n = window.wpNet, FC = window.wpFogCore;
      if (window.wpStream || (n && (n.foreign || (n.active && n.role === 'client')))) return null;   // someone else's table on this screen, its link up or between attempts (the owed review, 2026-10-09)
      var ps = (Array.isArray(items) ? items : []).filter(function(w) { return !!(w && FC && typeof FC.isPortal === 'function' && FC.isPortal(w, map)); });
      if (!ps.length) return null;
      var lock = ps.some(function(w) { return w.portalLock !== true; });
      return { lock: lock, items: ps, html: '<div class="menu-item cm-portal-lock" title="' + (lock ? 'No player travels through it until you unlock it: their double-click and a token they drop on it are refused, and where they can see it it wears a small lock. Your own drop of a player&rsquo;s token on it still sends them through.' : 'Players may travel through it again.') + '">' + (lock ? '<i class="wib wi-door"></i> Lock portal for players' : '<i class="wib wi-door"></i> Unlock portal') + '</div>' };
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
          '<div class="menu-item cm-door-open" title="' + (open ? 'Open: sight and tokens pass through. A player whose token stands next to an unlocked door can do this by clicking it.' : 'Closed: it blocks as a wall does.') + '"><i class="wib wi-' + (open ? 'door-open' : 'door') + '"></i> ' + (open ? 'Open door' : 'Close door') + s + '</div>'
          + '<div class="menu-item cm-door-lock" title="' + (lock ? 'No player opens or closes it until you unlock it: their click on it is refused, and it wears a small lock. You still open and close it yourself. This is the lock of the door itself, not Lock in place.' : 'Players next to it may open and close it again.') + '">' + (lock ? '<i class="wib wi-unlock"></i> Lock door' + s + ' for players' : '<i class="wib wi-lock"></i> Unlock door' + s + ' for players') + '</div>' };
  }
  function doorRowsDo(items, act) {
      var row = doorRows(items); if (!row) return '';
      if (act === 'open') { row.items.forEach(function(w) { if (row.open) w.doorOpen = true; else delete w.doorOpen; if (window.wpSoundOn) window.wpSoundOn.door(null, w, !!(window.wpFogCore && typeof window.wpFogCore.secretOn === 'function' && window.wpFogCore.secretOn(w))); }); return row.open ? 'opened' : 'closed'; }
      if (act === 'lock') { row.items.forEach(function(w) { if (row.lock) w.doorLock = true; else delete w.doorLock; }); return row.lock ? 'locked' : 'unlocked'; }
      return '';
  }
  // [sinkcheck:doorrow-end]
  // [fogcheck:hazardrows-start]
  // 1.6.2 (map hazards; the owner, by prompt: "A GM button on the area", "A Spread button, GM decides", "The area picks a token"). The GM's alone
  // (never a player's app, its link up or between attempts, never the stream window), on the map on screen. Roll for everyone in it: each character
  // whose token's center the piece covers, once, where the hazard's test holds for it (systemcore rollNeedsOk, the sheet's own names), gets a
  // card for the roll the hazard names (net.postDue, called for by the piece), its player's or the GM's. Spread fire: every painted cell set to
  // spread grows one cell outward (fogcore spreadCells), each new cell a copy of the cell it came from
  function hazardGm() { var n = window.wpNet; return !window.wpStream && !(n && (n.foreign || (n.active && n.role === 'client'))) && !!(window.wpCanPersistLocal && window.wpCanPersistLocal()); }
  function hazardRows(items) {
      var FC = window.wpFogCore; if (!hazardGm() || !FC || typeof FC.cleanHazard !== 'function') return null;
      var hz = (Array.isArray(items) ? items : []).filter(function(w) { return !!w && !w.isChar && !w.waiting; }).map(function(w) { return { w: w, h: FC.cleanHazard(w.hazard) }; }).filter(function(x) { return !!x.h; });
      var roll = hz.filter(function(x) { return !!x.h.roll; }), fire = hz.filter(function(x) { return !!x.h.spread && x.w.fill; }), html = '';
      if (roll.length) html += '<div class="menu-item cm-hazard-roll" title="Each character standing in it gets a card for its roll"><i class="wib wi-die"></i> Roll for everyone in it</div>';
      if (fire.length) html += '<div class="menu-item cm-hazard-spread" title="Every cell of fire set to spread grows one cell outward"><i class="wib wi-burst"></i> Spread fire</div>';
      return html ? { html: html, roll: roll, fire: fire } : null;
  }
  function hazardRoll(items, map) {
      var row = hazardRows(items), FG = window.wpFog, FC = window.wpFogCore, S = window.wpSystemCore, F = window.wpFormula, n = window.wpNet, camp = getActiveCampaign();
      if (!row || !row.roll.length || !FG || typeof FG.gridForMap !== 'function' || !FC || !S || !camp || !map) return 0;
      var grid = FG.gridForMap(map), sys = camp.system || {}, done = Object.create(null), sent = 0; if (!grid) return 0;
      row.roll.forEach(function(x) {
          var act = (Array.isArray(sys.rolls) ? sys.rolls : []).filter(function(r) { return r && r.id === x.h.roll; })[0]; if (!act) return;
          (map.whiteboard || []).forEach(function(t) {
              if (!t || !t.isChar || t.waiting || typeof t.charId !== 'string' || done[t.charId + '|' + act.id] || !camp.chars || !Object.prototype.hasOwnProperty.call(camp.chars, t.charId)) return;
              var cx = t.x + (t.w || 60) / 2, cy = t.y + (t.h || 52) / 2, cell = FC.cellOf(cx, cy, grid), p = FC.cellCenter(cell, grid); if (!FC.itemCovers(x.w, p.x, p.y, grid)) return;
              var ch = camp.chars[t.charId]; if (x.h['if'] && F && typeof S.rollNeedsOk === 'function' && typeof S.makeResolver === 'function') { var ok = false; try { ok = S.rollNeedsOk({ needs: x.h['if'] }, S.makeResolver(sys, ch, F, null), F) === true; } catch (e) { ok = false; } if (!ok) return; }
              done[t.charId + '|' + act.id] = 1;
              if (n && typeof n.postDue === 'function') { n.postDue(ch, act, 'called', 1, !!ch.ownerId && !ch.npc, { by: x.w.name || 'A hazard' }); sent++; }
          });
      });
      if (window.wpStepLog) window.wpStepLog('hazard v1', 'roll', { cards: sent });
      return sent;
  }
  function hazardSpread(map) {
      var FG = window.wpFog, FC = window.wpFogCore; if (!hazardGm() || !map || !FG || typeof FG.gridForMap !== 'function' || !FC || typeof FC.spreadCells !== 'function') return 0;
      var grid = FG.gridForMap(map); if (!grid) return 0; var cells = FC.spreadCells(map.whiteboard, grid), made = 0;
      cells.forEach(function(c) {
          var box = cellSnap(c.x, c.y), from = c.from, it = { id: 'wb' + uid(), type: box.type, x: box.px, y: box.py, w: box.w, h: box.h, baseW: box.w, baseH: box.h, fill: true };
          ['z', 'layer', 'color', 'opacity', 'texture', 'texSrc', 'texTile', 'terrain', 'terrainKind', 'name', 'hidden', 'hazard', 'smoke'].forEach(function(k) { if (from[k] !== undefined) it[k] = JSON.parse(JSON.stringify(from[k])); });
          map.whiteboard.push(it); made++;
      });
      if (window.wpStepLog) window.wpStepLog('hazard v1', 'spread', { cells: made });
      return made;
  }
  // A piece that follows a token (item.follow) stands centered on it, on every map of the campaign on this machine: looked at each half second and
  // after Properties sets it, written only where it moved, with one save
  function hazardFollow() {
      var FC = window.wpFogCore, camp = getActiveCampaign(); if (!hazardGm() || !FC || typeof FC.cleanFollow !== 'function' || !camp || !camp.items) return 0;
      var moved = 0;
      Object.keys(camp.items).forEach(function(id) { var m = camp.items[id]; if (!m || m.type !== 'map' || !Array.isArray(m.whiteboard)) return; var byId = null;
          m.whiteboard.forEach(function(w) { var f = w && !w.isChar ? FC.cleanFollow(w.follow) : null; if (!f) return; if (!byId) { byId = Object.create(null); m.whiteboard.forEach(function(t) { if (t && typeof t.id === 'string') byId[t.id] = t; }); }
              var t = byId[f]; if (!t || typeof t.x !== 'number' || typeof t.y !== 'number') return; var nx = Math.round(t.x + (t.w || 60) / 2 - (w.w || 0) / 2), ny = Math.round(t.y + (t.h || 52) / 2 - (w.h || 0) / 2);
              if (Math.abs(nx - w.x) < 1 && Math.abs(ny - w.y) < 1) return; w.x = nx; w.y = ny; moved++; });
      });
      if (moved) { save(); render(); if (window.wpFog && window.wpFog.invalidateVision) { window.wpFog.invalidateVision(); window.wpFog.redraw(); } }
      return moved;
  }
  window.wpHazardFollow = hazardFollow;
  if (typeof window !== 'undefined' && !window.wpStream && typeof setInterval === 'function') setInterval(function() { try { hazardFollow(); } catch (e) { console.error(e); } }, 500);
  // [fogcheck:hazardrows-end]
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
          ? '<div class="menu-item cm-secret-show" title="Your players see it as a door from now on. It stays shut until someone opens it."><i class="wib wi-eye"></i> Reveal secret door' + s + '</div>'
          : '<div class="menu-item cm-secret-make" title="Your players see wall here until it is found. The door is shut first, since an open door cannot be secret."><i class="wib wi-door"></i> Make secret door' + s + '</div>' };
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
          '<div class="menu-item cm-fog-hide" title="Every cell under it stays hidden from players, whatever their tokens see, wherever you move it. Pick it again to take the mark off.">' + (hide ? '&#10003; ' : '') + '<i class="wib wi-fog"></i> Under fog</div>'
          + '<div class="menu-item cm-fog-show" title="Every cell under it stays shown to players, wherever their tokens are and wherever you move it. Pick it again to take the mark off.">' + (show ? '&#10003; ' : '') + '<i class="wib wi-eye"></i> Always revealed</div>' };
  }
  function fogHandSet(items, which) {
      var row = fogHandRows(items); if (!row || (which !== 'hide' && which !== 'show')) return '';
      var off = which === 'hide' ? row.hide : row.show;
      row.items.forEach(function(w) { if (off) delete w.fogHand; else w.fogHand = which; });
      return off ? 'off' : which;
  }
  // [sinkcheck:foghandrow-end]
  // [sinkcheck:showrow-start]
  // A drawing to show, on the GM's menu (1.6.2; the owner, by prompt: a pick on the pen "AND a tick on each drawing to change it later"): ticked while every
  // drawing of the selection that may be one is one. Only a pen drawing fogcore showOk takes, and never a hidden one. Unticked, a player's drawing is a map
  // drawing and the GM's, as a yes to their ask makes it. The GM's alone: never a player's app, its link up or down, never the stream window. Fixed words only
  function showRow(items) {
      var n = window.wpNet, FC = window.wpFogCore;
      if (window.wpStream || (n && (n.foreign || (n.active && n.role === 'client'))) || !FC || typeof FC.showOk !== 'function') return null;
      var ps = (Array.isArray(items) ? items : []).filter(function(w) { return FC.showOk(w) && !w.hidden; });
      if (!ps.length) return null;
      var on = ps.every(function(w) { return w.toShow === true; });
      return { on: on, items: ps, html: '<div class="menu-item cm-toshow" title="' + (on ? 'It goes on the map, under the fog as the ground is. A player&rsquo;s drawing becomes yours.' : 'Everyone on this map sees it over the fog, and the ground under it stays hidden.') + '">' + (on ? '&#10003; ' : '') + '<i class="wib wi-eye"></i> To show, over the fog</div>' };
  }
  function showRowDo(items, am) {
      var row = showRow(items); if (!row || !window.wpDrawShow) return '';
      window.wpDrawShow.setShow(row.items, !row.on, am);
      return row.on ? 'map' : 'show';
  }
  // A player's right-click near a drawing of their own to show, whose line takes no press on their screen: one row, Ask to put it on the map. true: the menu is up
  function showMineMenu(e) {
      var DS = window.wpDrawShow, cMenu = document.getElementById('contextMenu'), wrap = document.getElementById('whiteboardWrap'); if (!DS || !cMenu || !wrap) return false;
      var box = wrap.getBoundingClientRect(), z = state.zoomLevel || 1, w = DS.mineAt(wbX(e.clientX, e.clientY, box, wrap), wbY(e.clientX, e.clientY, box, wrap)); if (!w) return false;
      e.preventDefault();
      cMenu.onclick = null;   // as showStanceMenu: a machine that hosted earlier in this run still holds the GM's item menu's handler
      cMenu.innerHTML = '<div class="menu-item cm-show-ask" title="Asks your GM to put this drawing on the map itself. On a yes it becomes the GM&rsquo;s."><i class="wib wi-eye"></i> Ask to put it on the map</div>';
      cMenu.style.display = 'flex';
      placeMenu(cMenu, e);
      var row = cMenu.querySelector('.cm-show-ask'); if (row) row.addEventListener('click', function(ce) { ce.stopPropagation(); cMenu.style.display = 'none'; DS.ask([w.id]); });
      return true;
  }
  // [sinkcheck:showrow-end]
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
      if (t.closest('#whiteboardWrap, #sidebar, #selToolbar, #contextMenu, .floating-toolbar, .shape-menu, .dropdown, .menu-item, [id$="Modal"], #sheetPanel, .hud-panel, #soundPanel, #dicePanel, #cmdkModal, #combatStrip, #docPanel, #prepCol, #musicPanel, #videoPanel, #fxPanel, #notepadPanel, #chatPanel, #prepMakeMenu, #namedInMenu, .sheet-dl-pop, .dice-modpop, .lib-pick, #dmgWin, #tokCardPanel, input, select, textarea, [contenteditable="true"]')) return;   // 1.5.6 (the sweep of 2026-10-17, seen live): every floating box keeps the selection, as the sheet and Sound do. 1.6.2 (the click test of the campaign before 1.6.2): and the menus a sheet or HUD hangs on the page (where it is aimed, what it asks, its load and level menus) and the dice's ± window — a press there let a token go, and the HUD of a sheet many NPC tokens share then read its range from another token (an attack in reach grayed as too far). The library picker (its Roll unheld reads the token's facing) and the Take damage window (its preview and Apply read the token context) keep it the same way
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
      function hide() { _tc.next = null; tokCardDrop(); if (tt.style.display !== 'none') tt.style.display = 'none'; }
      // backlog 236: a token's card (tc-on) stays while the pointer is on it, and goes a grace after the pointer left both it and the token
      tt.addEventListener('pointerenter', function() { if (tt.classList.contains('tc-on')) tokCardKeep(); });
      tt.addEventListener('pointerleave', function() { if (tt.classList.contains('tc-on')) tokCardLater(); });
      document.addEventListener('pointermove', function(e) {
          if (tt.style.display !== 'block') return;
          if (tt.contains(e.target)) return;
          var over = e.target && e.target.closest && e.target.closest('.wb-item');
          if (tt.classList.contains('tc-on')) { if (!over) tokCardLater(); return; }
          if (!over) hide();
      }, true);
      document.addEventListener('pointerdown', function(e) { if (!(e.target && tt.contains(e.target))) hide(); }, true);   // a press elsewhere puts it away and goes on to what it was for; a press on the card is the card's
      document.addEventListener('keydown', function(e) { if (e.key === 'Escape') hide(); });
      window.addEventListener('blur', hide);
      // a redraw of the board: the card the pointer is on is made again once the board is drawn (a roll from its note, a bar that moved), any
      // other goes; the pinned card is made again too. Called with true it simply goes
      window.wpHideTooltip = function(now) {
          if (now !== true && tokCardUp() && _tc.id) { var go = function() { if (tokCardUp()) tokCardRedo(); }; if (typeof requestAnimationFrame === 'function') requestAnimationFrame(go); else setTimeout(go, 0); }
          else hide();
          if (_pin.id) { var pd = function() { tokPinDraw(); }; if (typeof requestAnimationFrame === 'function') requestAnimationFrame(pd); else setTimeout(pd, 0); }
      };
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
  // whether the eraser's circle (radius r about x, y) touches the block as the board draws it: its box turned about its center, cut to a
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
      var x = wbX(clientX, clientY, box, wbWrap);
      var y = wbY(clientX, clientY, box, wbWrap);
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
  // its two neighbors keep their endpoints, so a small eraser removes exactly
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
                  if (item.rot) {   // render rotates the box about its center; test in that same (un-rotated) frame
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
          // a TURNED line (found 2026-10-17): the board turns it about its box's center, and the eraser cut it where it lay before the turn. The
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
              if (turn) {   // turned about its own center, the piece stands where the line drew it: its center goes where the line's turn takes it
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

      var hex = state.gridType === 'hex', LM = (typeof window !== 'undefined' && window.wpLatticeOf ? window.wpLatticeOf(m) : null);   // 1.6.2 (backlog 38): the map's own cell

      return {

          cellPx: LM ? (LM.type === 'hex' ? LM.h : LM.size) : hex ? 52 : 50,

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
  // [buildcheck:portalpeek-start]
  // 1.6.0 (backlog 32): a portal's hover card shows a small picture of the map it leads to, beside its name. mapshot.js draws it on this
  // computer from what this app holds and says when it is drawn; it is put in as an image element whose address is a PNG of that drawing and
  // nothing else, and only while the card is still the one it was asked for (the slot is still on the page)
  function portalPicFill(tt, mapId) {
      var MS = window.wpMapShot, card = tt && tt.firstElementChild; if (!MS || typeof MS.thumb !== 'function' || !card || typeof mapId !== 'string' || !mapId) return false;
      var slot = document.createElement('span'); slot.className = 'portal-peek'; slot.dataset.map = mapId; card.insertBefore(slot, card.firstChild);
      var put = function(url) {
          if (!slot.isConnected || slot.firstChild || typeof url !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+\/]+={0,2}$/.test(url)) return;
          var im = document.createElement('img'); im.alt = ''; im.src = url; slot.appendChild(im); slot.classList.add('on');
      };
      var now = MS.thumb(mapId, put); if (now) put(now);
      return true;
  }
  // [buildcheck:portalpeek-end]
  // [shelfcheck:pagepin-start]
  // A pin (1.5.4, pageshelf.js; the owner by prompt: "Pins on the map"): a piece of the play map that opens a page. The GM's alone: the
  // module says whether this screen sees pins and which page a piece opens. Here are the mark on the piece and the row of its right-click
  // menu. A page's name is text everywhere: escaped in the row, a data value and a tooltip's text on the mark
  function pagePinOf(item) { var PS = window.wpPageShelf; return PS && typeof PS.mapPin === 'function' ? PS.mapPin(item) : null; }
  function pagePinRow(items) {
      var its = (Array.isArray(items) ? items : []).filter(Boolean); if (its.length !== 1) return null;
      var pin = pagePinOf(its[0]); if (!pin) return null;
      var r = { id: pin.id, html: '<div class="menu-item cm-open-page" title="A click opens it over the map. Ctrl+click opens a new window. Alt+click opens the page itself."><i class="wib wi-page"></i> Open page: ' + esc(pin.title) + (pin.at ? ' \u203a ' + esc(pin.sec) : '') + '</div>' };
      if (pin.at) r.at = pin.at;   // 1.6.0: the part of the page the pin names, where the row lands
      return r;
  }
  // 1.6.0: a pin's landing, the part of its page it names, for the one rule; none opens the page at the top, exactly as before
  function pagePinLand(at) { return typeof at === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(at) ? { at: at } : null; }
  // A pin's tooltip: the page, the part it names, the first lines of the page where they were read (1.6.0) and what a press does. Plain
  // text, read by the app's tooltip as text (tooltips.js writes textContent; its box keeps the line breaks)
  function pagePinTip(name, sec, peek, card) {
      if (card === true) return (sec ? 'Its card: ' + sec + ', in ' + name : 'Its card is in ' + name) + '.' + (typeof peek === 'string' && peek ? '\n\n' + peek + '\n\n' : ' ') + 'A click opens the card in Prep where it is listed, else over the map. Ctrl+click opens a new window. Alt+click opens the page itself.';   // 1.6.2: a token whose sheet a person card names
      return 'Opens ' + name + (sec ? ' at ' + sec : '') + '.' + (typeof peek === 'string' && peek ? '\n\n' + peek + '\n\n' : ' ') + 'A click opens it over the map. Ctrl+click opens a new window. Alt+click opens the page itself.';
  }
  // 1.6.2 (backlog 107 (a), step 5): what the hover card of a token says of the person card that names its sheet, in the GM's part: what they
  // want, and how many answers the card holds. Plain text for a text node
  function pageCardLine(item) {
      var PS = window.wpPageShelf, sc = PS && typeof PS.sheetCard === 'function' ? PS.sheetCard(item) : null; if (!sc) return '';
      var n = typeof sc.says === 'number' && sc.says > 0 ? Math.round(sc.says) : 0;
      return [sc.wants ? 'Wants: ' + sc.wants : '', 'Card: ' + (n ? n + (n === 1 ? ' answer' : ' answers') : 'no answers yet') + ', in ' + sc.pl].filter(Boolean).join(String.fromCharCode(10));
  }
  // The mark: a small button at the piece's corner. A press on it is no press on the piece: nothing is selected or dragged, and the page opens by the one rule
  function pagePinMark() {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'wb-pin';
      ['pointerdown', 'mousedown', 'dblclick'].forEach(function(ev) { b.addEventListener(ev, function(e) { e.stopPropagation(); }); });
      b.addEventListener('click', function(e) { e.stopPropagation(); e.preventDefault(); var PS = window.wpPageShelf, PR = window.wpPrep, land = pagePinLand(b.dataset.at);
          if (b.dataset.card === '1' && land && PR && typeof PR.card === 'function' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && PR.card(b.dataset.page, land.at) === true) return;   // 1.6.2: a card's mark opens the card in the Prep column where the column lists it
          if (PS && b.dataset.page) { if (land) PS.open(b.dataset.page, PS.wayNow(e), land); else PS.open(b.dataset.page, PS.wayNow(e)); } });
      b.addEventListener('pointerenter', function() {   // 1.6.0: resting on the mark shows the first lines of its page, read as it stands now, as text alone
          var PS = window.wpPageShelf, peek = PS && typeof PS.mapPinPeek === 'function' && b.dataset.page ? PS.mapPinPeek(b.dataset.page, b.dataset.at || '') : '';
          if (b.dataset.name) b.dataset.tip = pagePinTip(b.dataset.name, b.dataset.sec || '', typeof peek === 'string' ? peek : '', b.dataset.card === '1');
      });
      return b;
  }
  // [boxcheck:mark-start]
  // 1.6.2 (backlog 42, fold 2): a container's mark, a real button at the top left of its piece. On the GM's screen it opens the window; on a
  // player's app it asks the host to open it with a token of theirs next to it (the piece wears boxed from the host, never its box id). Never
  // in the stream window
  function boxMarkSync(el, item, hidden) {
      var B = window.wpBoxes, n = window.wpNet, mark = el.querySelector(':scope > .wb-box');
      var body = !!B && B.gmMay() && item.isChar && typeof B.bodyHas === 'function' && B.bodyHas(item), gm = !!B && B.gmMay() && ((typeof item.box === 'string' && B.has(item)) || body), pl = !gm && item.boxed === 1 && !!n && n.active && n.role === 'client' && !n.stream;   // fold 3: a lootable body wears it too
      if (hidden || window.wpStream || !(gm || pl)) { if (mark) mark.remove(); return; }
      if (!mark) {
          mark = document.createElement('button'); mark.type = 'button'; mark.className = 'wb-box wi-chest';
          ['pointerdown', 'mousedown', 'dblclick'].forEach(function(ev) { mark.addEventListener(ev, function(e) { e.stopPropagation(); }); });
          mark.addEventListener('click', function(e) { e.stopPropagation(); e.preventDefault(); var B2 = window.wpBoxes, id = mark.dataset.id; if (!B2 || !id) return; if (B2.gmMay()) { if (mark.dataset.body === '1' && typeof B2.bodyOpen === 'function') B2.bodyOpen(id); else B2.open(id); } else B2.ask(id); });
          el.appendChild(mark);
      }
      mark.dataset.body = body ? '1' : ''; var words = body ? 'Can be looted: open its sheet' : gm ? 'Open contents' : item.isChar ? 'Search the body' : 'Open it'; if (mark.dataset.id !== item.id || mark.dataset.tip !== words) { mark.dataset.id = item.id; mark.dataset.tip = words; mark.setAttribute('aria-label', words); }
  }
  // [boxcheck:mark-end]
  function pagePinSync(el, item, hidden) {
      var mark = el.querySelector(':scope > .wb-pin'), pin = hidden ? null : pagePinOf(item);   // (a card's mark wears wb-pin too)
      if (!pin) { if (mark) mark.remove(); return; }
      if (!mark) { mark = pagePinMark(); el.appendChild(mark); }
      var card = pin.card === true;   // 1.6.2: the mark of a person card that names this token's sheet: the card's own drawing, in a child, in place of the page's
      if (mark.dataset.page !== pin.id || mark.dataset.name !== pin.title || (mark.dataset.at || '') !== (pin.at || '') || (mark.dataset.sec || '') !== (pin.sec || '') || (mark.dataset.card === '1') !== card) {
          if (card !== (mark.dataset.card === '1')) {
              mark.className = card ? 'wb-pin wb-pin-card' : 'wb-pin'; if (card) mark.dataset.card = '1'; else delete mark.dataset.card;
              while (mark.firstChild) mark.removeChild(mark.firstChild);
              if (card) { var ic = document.createElement('i'); ic.className = 'wib wi-person'; mark.appendChild(ic); }
          }
          mark.dataset.page = pin.id; mark.dataset.name = pin.title; mark.dataset.tip = pagePinTip(pin.title, pin.sec || '', '', card); mark.setAttribute('aria-label', card ? 'Open the card' + (pin.sec ? ' of ' + pin.sec : '') + ', in ' + pin.title : 'Open ' + pin.title + (pin.sec ? ' at ' + pin.sec : ''));
          if (pin.at) { mark.dataset.at = pin.at; mark.dataset.sec = pin.sec || ''; } else { delete mark.dataset.at; delete mark.dataset.sec; }   // 1.6.0: the part of the page the pin names
      }
  }
  // [shelfcheck:pagepin-end]
  // [sinkcheck:tokenfx-start]
  // Conditions C1 (docs/CONDITIONS_PLAN.md): a token's effects as a row of small icons at its top left (6 drawn, then "+N"), ringed by tone, a
  // GM-only one dashed, their names in the row's title. A glyph is a mask whose URL is built only from glyphPath's answer (the fixed table);
  // an emoji or a symbol is escaped text; an effect with no icon shows its name's first letter
  var FX_GLYPH_BASE = '/assets/icons/fa/';
  // [lookcheck:cardaside-start]
  // One bubble at a time on a token (the owner, 2026-10-29, by prompt, of a bar's ring: "Card steps aside"; and no double tooltips anywhere):
  // while the pointer rests on a part of the token with a tooltip of its own (a bar's arc, the effect icons, a badge), the hover card is kept
  // out of sight and that part's tooltip shows alone; back on the token itself the card shows again. The card stays built and placed
  function cardAside(el, node) {
      var tt = document.getElementById('wbTooltip'); if (!tt) return false;
      var t = node && node.closest ? node.closest('[data-tip], [title]') : null;
      var on = !!t && t !== el && !!el && el.contains(t) && !!(t.getAttribute('data-tip') || t.getAttribute('title'));
      if (tt.classList.contains('wb-aside') !== on) tt.classList.toggle('wb-aside', on);
      return on;
  }
  // [lookcheck:cardaside-end]
  // [lookcheck:badgesay-start]
  // 1.6.0 (the owner, 2026-10-31: "hovering over the tokens that have badges should tell you what the badges do as well"): a target mark, its tags
  // and a status mark take no pointer, so their own tooltips never show. The token's hover card says them in words, as text. A new mark on a
  // token that takes no pointer says itself here
  // [lookcheck:wallwords-start]
  function wallWords(w, FC) {   // [its name, what it does] for a piece that stops something, or null. The name is the piece's own where it has one
      if (!w || !FC) return null; var nm = typeof w.name === 'string' ? w.name.trim() : '', sec = typeof FC.secretOn === 'function' && FC.secretOn(w), dr = typeof FC.isDoor === 'function' && FC.isDoor(w), bar = typeof FC.barrierOn === 'function' && FC.barrierOn(w);
      if (sec) return [nm || 'Secret door', 'Players see a wall here until it is found'];
      if (dr) return [nm || 'Door', (w.doorOpen === true ? 'Open' : 'Shut') + (w.doorLock === true ? ', locked for players' : '')];
      if (bar) return [nm || 'Barrier', 'Stops movement, and can be seen through'];
      if (w.blocksSight === true) return [nm || 'Wall', 'Blocks sight and movement'];
      return null;
  }
  // [lookcheck:wallwords-end]
  function markSays(name, cv, rg, lt, hg) {   // one target mark: who, and what each tag on it shows
      var parts = [];
      if (cv) parts.push((TARGET_COVER_GLYPH[cv.name] || '\u25d0') + ' ' + cv.name);
      if (rg && (rg.mod !== 0 || (rangeNamesOn() && typeof rg.band === 'string' && rg.band))) parts.push(rangeTitle(rg));
      if (lt) parts.push(TARGET_LIGHT_GLYPH[lt.lv === 0 ? 0 : 1] + ' ' + lt.name);
      if (hg && typeof hg.mod === 'number' && isFinite(hg.mod) && hg.mod !== 0) parts.push(heightTitle(hg));
      return 'Targeted by ' + name + (parts.length ? ': ' + parts.join(', ') : '');
  }
  // 1.6.2, backlog 236: the same marks as chips, { t: the words, k: its kind, g: 1 for an effect the GM alone sees }, in the lines' order and
  // each effect a chip of its own. el may be null (a pinned card of a token on a map not on screen: no target marks are drawn for it)
  function badgeChips(el, item) {
      var out = [], marks = el && el.querySelector ? el.querySelector(':scope > .target-marks') : null, says = marks && Array.isArray(marks._says) ? marks._says : [];
      says.slice(0, 8).forEach(function(s) { out.push({ t: s, k: 'mark' }); }); if (says.length > 8) out.push({ t: (says.length - 8) + ' more target it', k: 'mark' });
      if (item.status === 'down') out.push({ t: 'Down', k: 'down' }); else if (item.status === 'dead') out.push({ t: 'Dead', k: 'down' });
      var fx = window.wpSheets && window.wpSheets.tokenFx ? window.wpSheets.tokenFx(item) : null;
      var fxL = window.wpSheets && typeof window.wpSheets.tokenFxLeft === 'function' ? window.wpSheets.tokenFxLeft(item) : null;   // 1.6.3 (the combat review, finding 21): what each timed effect has left, as this screen holds the character
      (Array.isArray(fx) ? fx.slice(0, 8) : []).forEach(function(e) { if (e && typeof e.n === 'string' && e.n) { var lf = fxL && Object.prototype.hasOwnProperty.call(fxL, e.n) && typeof fxL[e.n] === 'string' ? fxL[e.n] : '', c = { t: lf ? e.n + ', ' + lf : e.n, n: e.n, k: e.t === 'buff' ? 'buff' : e.t === 'debuff' ? 'debuff' : 'fx' }; if (e.g === 1) c.g = 1; out.push(c); } });
      var env = window.wpSheets && window.wpSheets.tokenEnv ? window.wpSheets.tokenEnv(item) : null;
      if (env && typeof env.text === 'string' && env.text) out.push({ t: env.text, k: 'env' });
      var cpF = window.wpCompass && typeof window.wpCompass.faceWords === 'function' ? window.wpCompass.faceWords(item) : ''; if (cpF) out.push({ t: cpF, k: 'face' });   // 1.6.2, backlog 82: the way it faces by the map's compass
      return out;
  }
  function badgeLines(el, item) {   // the card's lines, one a mark, from what this screen drew; at most eight target marks and then how many more
      var out = [], fx = [];
      badgeChips(el, item).forEach(function(c) { if (c.k === 'fx' || c.k === 'buff' || c.k === 'debuff') { if (!fx.length) out.push(fx); fx.push(c.n || c.t); } else out.push(c.t); });   // an effect by its name alone here: a comma would run into the list
      return out.map(function(l) { return Array.isArray(l) ? 'Effects: ' + l.join(', ') : l; });
  }
  // [lookcheck:badgesay-end]
  // [lookcheck:tokcard-start]
  // Backlog 236, a token's hover card on the play map (the owner, 2026-11-14, by prompt after a drawn mock-up: "Both", "In parts, as drawn",
  // "Health and marks first"). The card sits beside the token, never over it, and stays while the pointer goes onto it within the grace; its
  // pin keeps it as a small window. It is laid out in parts: a head (the round picture, the name, a gray line with the sheet's name and NPC or
  // the player's name, Sheet where the viewer may open it), then Health, Marks and effects, the note, and Where, each only when it holds
  // something. Built of elements and text nodes alone: every word is set as text, a color is a #rrggbb, a picture's address is the caller's
  var TOKCARD_GRACE = 400, TOKCARD_GAP = 10;
  var TOKCARD_KINDS = ['mark', 'down', 'fx', 'buff', 'debuff', 'env', 'face', 'stance', 'ranged', 'sense'];
  // Prose as the card says it: an art file's name or an id in brackets is left out, since the head shows the picture and Where the room
  function tokCardTidy(s) {
      if (typeof s !== 'string') return '';
      return s.replace(/[ \t]*\((?:[A-Za-z][A-Za-z ]{0,15}:\s*)?[^()\n]{0,160}?\.(?:png|jpe?g|webp|gif|svg|avif)\)/gi, '').replace(/[ \t]*\((?:suggested\s+)?id\b[^()\n]{0,160}\)/gi, '').replace(/[ \t]+([.,;:])/g, '$1').replace(/[ \t]{2,}/g, ' ').trim();
  }
  function tokCardCap(s, n) { s = tokCardTidy(s); return s.length > n ? s.slice(0, n) + '…' : s; }
  function tokCardFig(v) { return typeof v === 'number' && isFinite(v) ? String(Math.round(v * 100) / 100) : ''; }
  // The card's parts from plain figures. o: { name, sheet, who, about, bars: [{ n, v, m, c, g }], fields: [text], chips: [{ t, k, g }],
  // notes: [text], room, map, gm (the GM's screen: the note is "Your note") }. Answers { name, sub, about, parts: [{ k, label, ... }] }
  function tokCardModel(o) {
      o = o || {}; var str = function(v) { return typeof v === 'string' ? v.trim() : ''; }, strs = function(a) { return (Array.isArray(a) ? a : []).map(str).filter(Boolean); };
      var name = str(o.name) || 'Unnamed character', sheet = str(o.sheet), who = str(o.who);
      var m = { name: name, sub: [sheet && sheet !== name ? sheet : '', who].filter(Boolean).join(' · '), about: tokCardCap(str(o.about), 600), parts: [] };
      var bars = (Array.isArray(o.bars) ? o.bars : []).filter(function(e) { return !!e && typeof e === 'object' && typeof e.v === 'number' && isFinite(e.v); }).slice(0, 2).map(function(e) {
          var mx = typeof e.m === 'number' && isFinite(e.m) && e.m > 0 ? e.m : 0;
          return { n: str(e.n) || 'Bar', v: tokCardFig(e.v), m: mx ? tokCardFig(mx) : '', f: mx ? Math.max(0, Math.min(1, e.v / mx)) : 0, c: typeof e.c === 'string' && /^#[0-9a-f]{6}$/i.test(e.c) ? e.c : '#d9534f', g: e.g === 1 };
      });
      var fields = strs(o.fields).slice(0, 12);
      if (bars.length || fields.length) m.parts.push({ k: 'health', label: 'Health', bars: bars, fields: fields });
      var chips = (Array.isArray(o.chips) ? o.chips : []).filter(function(c) { return !!c && !!str(c.t); }).slice(0, 24).map(function(c) { var r = { t: str(c.t), k: TOKCARD_KINDS.indexOf(c.k) >= 0 ? c.k : '' }; if (c.g === 1) r.g = 1; return r; });
      if (chips.length) m.parts.push({ k: 'marks', label: 'Marks and effects', chips: chips });
      var notes = strs(o.notes).map(function(t) { return tokCardCap(t, 1200); }).filter(Boolean).slice(0, 4);
      if (notes.length) m.parts.push({ k: 'note', label: o.gm === true ? 'Your note' : 'Note', notes: notes });
      var where = [str(o.room) ? ['Room', str(o.room)] : null, str(o.map) ? ['Map', str(o.map)] : null].filter(Boolean);
      if (where.length) m.parts.push({ k: 'where', label: 'Where', rows: where });
      return m;
  }
  // The card from its model. o: { pic (an img element, or null), sheet (a function: Sheet shows only with one), pin (a function: the pin shows
  // only with one), pinned (the pin lit, as it is in the window), dice (a function given the note's element: its dice made pressable) }.
  // A press on the card is the card's: it never reaches the board under it
  function tokCardBuild(doc, m, o) {
      o = o || {}; var U = window.wpUi;
      var mk = function(tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
      var c = U && typeof U.card === 'function' ? U.card({ name: m.name, sub: m.sub, pic: o.pic || null, cls: 'tok-card' }, doc) : null;
      if (!c) { c = { el: mk('div', 'ui-card tok-card'), side: mk('span', 'ui-card-side'), body: mk('div', 'ui-card-body') }; var top = mk('div', 'ui-card-top'); top.appendChild(mk('b', 'ui-card-name', m.name)); if (m.sub) top.appendChild(mk('small', 'ui-card-sub', m.sub)); top.appendChild(c.side); c.el.appendChild(top); c.el.appendChild(c.body); }
      var btn = function(cls, text, tip, fn) { var b = mk('button', 'tool ghost ' + cls, text); b.type = 'button'; b.title = tip; b.setAttribute('aria-label', tip); b.addEventListener('click', function(e) { e.stopPropagation(); e.preventDefault(); fn(); }); return b; };
      var seg = mk('span', 'ui-seg tc-acts');
      if (typeof o.sheet === 'function') seg.appendChild(btn('tc-sheet', 'Sheet', 'Open its sheet', o.sheet));
      if (typeof o.pin === 'function') { var pb = btn('tc-pin' + (o.pinned ? ' on' : ''), o.pinned ? 'Pinned' : 'Pin', o.pinned ? 'Kept as a window: close it with its × or Escape' : 'Keep this card open as a small window', o.pin); pb.setAttribute('aria-pressed', o.pinned ? 'true' : 'false'); seg.appendChild(pb); }
      if (seg.firstChild) c.side.appendChild(seg);
      if (m.about) c.body.appendChild(mk('div', 'tc-about', m.about));
      m.parts.forEach(function(p) {
          var sec = mk('section', 'tc-part tc-part-' + p.k); sec.appendChild(mk('div', 'tc-label', p.label));
          (p.bars || []).forEach(function(b) {
              var row = mk('div', 'tc-bar' + (b.g ? ' gm' : '')), tr = mk('span', 'tc-track'), fill = mk('span', 'tc-fill');
              row.appendChild(mk('span', 'tc-bar-name', b.n + (b.g ? ' (GM only)' : '')));
              fill.style.width = Math.round(b.f * 1000) / 10 + '%'; fill.style.background = b.c; tr.appendChild(fill); row.appendChild(tr);
              row.appendChild(mk('span', 'tc-bar-fig', b.m ? b.v + ' / ' + b.m : b.v)); sec.appendChild(row);
          });
          (p.fields || []).forEach(function(f) { sec.appendChild(mk('div', 'tc-field', f)); });
          if (p.chips) { var cw = mk('div', 'tc-chips'); p.chips.forEach(function(ch) { var s = mk('span', 'tc-chip' + (ch.k ? ' ' + ch.k : '') + (ch.g ? ' gm' : ''), ch.t); if (ch.g) s.title = 'The GM alone sees this'; cw.appendChild(s); }); sec.appendChild(cw); }
          (p.notes || []).forEach(function(t) { var n = mk('div', 'tc-note', t); sec.appendChild(n); if (typeof o.dice === 'function') o.dice(n); });
          (p.rows || []).forEach(function(r) { var w = mk('div', 'tc-where'); w.appendChild(mk('span', 'tc-where-k', r[0])); w.appendChild(mk('span', 'tc-where-v', r[1])); sec.appendChild(w); });
          c.body.appendChild(sec);
      });
      // The card's own press: nothing on the board under it starts a drag, a marquee or a menu. The card takes presses only with Select in hand
      // (style.css), and even then the button that pans, and a press while Space is held, go on to the board, so a pan under it never dies
      var passes = function(e) {
          if (e.type !== 'pointerdown' && e.type !== 'mousedown') return false;
          if (e.button === 1) return true;
          var W = typeof window !== 'undefined' && window ? window : null; if (!W) return false;
          if (W.wpSpacePan && !e.button) return true;
          var pb = W.wpMouse && typeof W.wpMouse.panButton === 'function' ? W.wpMouse.panButton() : 1;
          return e.button > 0 && e.button === pb;
      };
      ['pointerdown', 'mousedown', 'dblclick', 'contextmenu'].forEach(function(ev) { c.el.addEventListener(ev, function(e) { if (passes(e)) return; e.stopPropagation(); }); });
      c.el.addEventListener('wheel', function(e) { var b = c.body; if (b && b.scrollHeight > b.clientHeight + 1) e.stopPropagation(); }, { passive: true });   // a long card scrolls, and the board does not zoom under it
      return c.el;
  }
  // Where the card stands beside the token, in the board's own numbers: tok and room are { l, t, r, b }, the card w by h. Right of the token with
  // their tops level, else left, else below, else above: the first that fits the room whole, moved along its side to stay in it. Where none
  // fits, the one that covers the least of the token. Never over the token where any side has room
  function tokCardSpot(tok, w, h, room, gap) {
      var G = typeof gap === 'number' ? gap : TOKCARD_GAP, clamp = function(v, lo, hi) { return Math.max(lo, Math.min(v, hi)); };
      var cy = clamp(tok.t, room.t, room.b - h), cx = clamp(tok.l, room.l, room.r - w);
      var tries = [{ x: tok.r + G, y: cy }, { x: tok.l - G - w, y: cy }, { x: cx, y: tok.b + G }, { x: cx, y: tok.t - G - h }];
      for (var i = 0; i < tries.length; i++) { var p = tries[i]; if (p.x >= room.l && p.x + w <= room.r && p.y >= room.t && p.y + h <= room.b) return { x: Math.round(p.x), y: Math.round(p.y) }; }
      var best = null, least = Infinity;
      tries.forEach(function(p) {
          var x = clamp(p.x, room.l, Math.max(room.l, room.r - w)), y = clamp(p.y, room.t, Math.max(room.t, room.b - h));
          var ov = Math.max(0, Math.min(x + w, tok.r) - Math.max(x, tok.l)) * Math.max(0, Math.min(y + h, tok.b) - Math.max(y, tok.t));
          if (ov < least) { least = ov; best = { x: Math.round(x), y: Math.round(y) }; }
      });
      return best;
  }
  // [lookcheck:tokcard-end]
  // [sinkcheck:tokenbars-start]
  // Backlog 28 (the owner, 2026-10-29, by prompt: "A ring around it", the numbers on hover, each bar its own color): a token's bars as a thin ring
  // just outside its edge, Bar 1 filling the left half from the bottom up and over, Bar 2 the right half from the top down, each its own color
  // over a dark track, a GM-only bar dashed (the GM's screen alone); turned back against the token's own turn, so Bar 1 stays at the left. Built
  // of elements and attributes alone: numbers as the cleaners gave them, a color that is a #rrggbb, the tooltip ("HP 7 / 14") a text
  var BAR_GAP = 6, BAR_SPAN = 168;
  function tokenBarsSig(item, list) { return [+item.w || 60, +item.h || 52, +item.rot || 0].join(',') + '|' + list.map(function(e) { return [e.s, e.v, e.m, e.n, e.c, e.g === 1 ? 1 : 0].join(','); }).join(';'); }
  function tokenBarsSvg(item, list) {
      var NS = 'http://www.w3.org/2000/svg', S = window.wpSystemCore, w = Math.max(8, +item.w || 60), h = Math.max(8, +item.h || 52), sw = Math.round(Math.max(2.5, Math.min(w, h) * 0.06) * 10) / 10, pad = sw + 2;
      var W = w + 2 * pad, H = h + 2 * pad, cx = W / 2, cy = H / 2, rx = w / 2 + sw / 2 + 0.5, ry = h / 2 + sw / 2 + 0.5;
      var sv = document.createElementNS(NS, 'svg'); sv.setAttribute('class', 'token-bars'); sv.setAttribute('viewBox', '0 0 ' + W + ' ' + H); sv.setAttribute('width', String(W)); sv.setAttribute('height', String(H));
      sv.style.left = -pad + 'px'; sv.style.top = -pad + 'px'; if (+item.rot) sv.style.transform = 'rotate(' + (-item.rot) + 'deg)';
      var at = function(deg) { var t = deg * Math.PI / 180; return (Math.round((cx - rx * Math.sin(t)) * 100) / 100) + ' ' + (Math.round((cy + ry * Math.cos(t)) * 100) / 100); };   // 0 the bottom, 90 the left, 180 the top, 270 the right
      var arc = function(a0, a1) { return 'M ' + at(a0) + ' A ' + rx + ' ' + ry + ' 0 0 1 ' + at(a1); };
      list.forEach(function(e) {
          if (!e || (e.s !== 0 && e.s !== 1)) return;
          var a0 = e.s === 0 ? BAR_GAP : 180 + BAR_GAP, fill = S && S.barFill ? S.barFill(e) : 0, g = document.createElementNS(NS, 'g');
          g.setAttribute('class', 'tbar' + (e.g === 1 ? ' gm' : '')); g.setAttribute('data-tip', S && S.barTip ? S.barTip(e) + (e.g === 1 ? ' (GM only)' : '') : '');
          var tr = document.createElementNS(NS, 'path'); tr.setAttribute('class', 'tbar-track'); tr.setAttribute('d', arc(a0, a0 + BAR_SPAN)); tr.setAttribute('stroke-width', String(sw)); g.appendChild(tr);
          if (fill > 0) { var fp = document.createElementNS(NS, 'path'); fp.setAttribute('class', 'tbar-fill'); fp.setAttribute('d', arc(a0, a0 + Math.max(1, BAR_SPAN * fill))); fp.setAttribute('stroke-width', String(sw)); fp.setAttribute('stroke', /^#[0-9a-f]{6}$/.test(e.c) ? e.c : '#d9534f'); g.appendChild(fp); }
          sv.appendChild(g);
      });
      return sv;
  }
  // [sinkcheck:tokenbars-end]
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
  // The room a token stands in: its middle inside a floor piece linked to a room, the smallest such (as net.js roomUnder finds it)
  function tokRoomUnder(item, map) {
      if (!item || !map || !Array.isArray(map.whiteboard)) return null;
      var cx = item.x + (item.w || 0) / 2, cy = item.y + (item.h || 0) / 2, best = null, area = Infinity;
      map.whiteboard.forEach(function(o) { if (!o || o.id === item.id || !o.nodeId || o.isChar) return; var ow = o.w || 0, oh = o.h || 0; if (cx < o.x || cx > o.x + ow || cy < o.y || cy > o.y + oh || ow * oh >= area) return; area = ow * oh; best = o; });
      return best ? (map.rooms || []).find(function(r) { return r && r.id === best.nodeId; }) || null : null;
  }
  // A token's card on this screen, from what the board and the sheets already work out (backlog 236). el: the token on the board (null for a
  // pinned card of a map not on screen). Nothing of the GM's (the note, the roster's info, the person card) on a player's app, as before
  function tokCardFor(wItem, el, map, pinned) {
      var camp = getActiveCampaign(), S = window.wpSheets, n = window.wpNet, client = !!(n && n.active && n.role === 'client');
      var c = S && typeof S.charById === 'function' && wItem.charId ? S.charById(wItem.charId) : null, who = '';
      if (c && c.npc) who = 'NPC';
      else { var own = c && (c.ownerId || c.shared === 1) ? c : wItem.ownerId ? { ownerId: wItem.ownerId } : null; if (!own) who = 'NPC'; else { var on = S && typeof S.ownerName === 'function' ? S.ownerName(own, camp) : ''; who = on && on !== own.ownerId ? on : 'A player'; } }   // never a bare id
      var chips = badgeChips(el, wItem);
      if (stanceOn('elevation')) { var hvE = tokenElevation(wItem, map), hvG = groundWords(wItem, map); if (hvE || hvG) chips.push({ t: 'Elevation ' + fmtElev(hvE) + ' ' + lenUnit() + (hvG ? ' (' + hvG + ')' : ''), k: 'stance' }); }   // item 19b H5: its height, the ground it stands on included (and named)
      var postAt = stanceOn('posture') ? tokenPostureAt(wItem) : null; if (postAt && postAt.i > 0 && postAt.p && postAt.p.name) chips.push({ t: String(postAt.p.name), k: 'stance' });   // conditions C3: its posture's name in the list in use
      if (postureRanged(wItem)) chips.push({ t: postureRangedLine(tokenPostureAt(wItem).p), k: 'ranged' });
      if (window.wpFog && window.wpFog.senseWordsOf) senseSays(window.wpFog.senseWordsOf(wItem.id)).forEach(function(t) { chips.push({ t: t, k: 'sense' }); });   // 1.6.3: the sense line above it, in words (it may be put away with its marks)   // its posture's ranged note, in the website's words (display only)
      var notes = [], entry = null, roster = null;
      if (!client) {
          if (wItem.charRef) (map.rooms || []).some(function(rm) { entry = (rm.characters || []).find(function(x) { return x && x.id === wItem.charRef; }) || null; if (entry) roster = rm; return !!entry; });
          if (wItem.gmInfo) notes.push(String(wItem.gmInfo));   // the GM's note on the token (stripped on the wire)
          if (entry && entry.info) notes.push(String(entry.info));   // the roster entry's notes (players never get info)
          var cardLn = typeof pageCardLine === 'function' ? pageCardLine(wItem) : ''; if (cardLn) notes.push(cardLn);   // 1.6.2: the person card that names its sheet, worked out on this screen, never sent
      }
      var rm = tokRoomUnder(wItem, map) || roster;
      var tint = (wItem.color && wItem.color !== 'transparent') ? wItem.color : '';
      var ownerAv = (!wItem.src && wItem.face && window.wpNet && window.wpNet.faceView) ? (window.wpNet.faceView({ face: wItem.face }, cssColor(tint || '#4db3d3')).img || null) : null;   // Onboarding F1c: the character's own face, never its owner's live profile picture
      var src = wItem.src ? resolveImg(wItem.src) : (ownerAv || (window.wpDefaultAvatar ? window.wpDefaultAvatar(tint || ('hsl(' + wbHashHue(wItem.charName || wItem.id) + ',55%,55%)')) : null)), pic = null;
      if (src) { pic = document.createElement('img'); pic.src = src; pic.alt = ''; pic.loading = 'lazy'; pic.decoding = 'async'; }
      var model = tokCardModel({ name: wItem.charName || '', sheet: c && typeof c.name === 'string' ? c.name : '', who: who, about: wItem.charStats || '',
          bars: S && S.tokenBars ? S.tokenBars(wItem, map.id) : [], fields: S && S.hoverLinesForToken ? S.hoverLinesForToken(wItem, camp, map.id) : [], chips: chips, notes: notes,
          room: rm ? rm.name || '' : '', map: map.meta && map.meta.title || '', gm: !client });
      var cid = wItem.charId, mayS = !!cid && !!S && typeof S.canOpen === 'function' && S.canOpen(cid);
      var card = tokCardBuild(document, model, { pic: pic, pinned: !!pinned,
          sheet: mayS ? function() { if (!pinned && window.wpHideTooltip) window.wpHideTooltip(true); if (window.wpSheets) window.wpSheets.openSheet(cid); } : null,
          pin: window.wpStream ? null : pinned ? tokPinClose : function() { tokPinOpen(wItem.id, map.id); },
          dice: client ? null : function(nd) { if (window.wpInlineDice && typeof window.wpInlineDice.apply === 'function') window.wpInlineDice.apply(nd); } });
      if (window.wpPlook) { var nmEl = card.querySelector('.ui-card-name'); if (nmEl) window.wpPlook.dress(nmEl, window.wpPlook.ofTok(wItem)); }   // the name in the token's own look
      return card;
  }
  // The hover card: it sits beside the token and stays while the pointer is on the token or on it, and for a grace after it leaves both
  var _tc = { id: '', timer: 0, next: null };
  function tokTip() { return document.getElementById('wbTooltip'); }
  function tokCardUp() { var tt = tokTip(); return !!tt && tt.style.display === 'block' && tt.classList.contains('tc-on'); }
  function tokCardKeep() { if (_tc.timer) clearTimeout(_tc.timer); _tc.timer = 0; }
  function tokCardLater() { if (!_tc.timer) _tc.timer = setTimeout(tokCardGo, TOKCARD_GRACE); }
  function tokCardDrop() { var tt = tokTip(); tokCardKeep(); _tc.id = ''; if (!tt) return; if (tt.style.display !== 'none') tt.style.display = 'none'; tt.classList.remove('tc-on'); tt.classList.remove('wb-aside'); }
  function tokCardGo() {   // the grace is over: the card goes, and the piece the pointer rests on now shows its own
      _tc.timer = 0; var nx = _tc.next; _tc.next = null; tokCardDrop();
      if (nx && nx.el.isConnected && nx.el.matches(':hover') && typeof PointerEvent === 'function') { nx.el.dispatchEvent(new PointerEvent('pointerenter', { clientX: nx.x, clientY: nx.y })); nx.el.dispatchEvent(new PointerEvent('pointermove', { clientX: nx.x, clientY: nx.y, bubbles: true })); }
  }
  // [lookcheck:tokredo-start]
  // A card is not drawn again under a press on it (a button pressed would be replaced under the pointer, io.js pressHold) nor while words of it
  // are selected: the redraw waits for the press to land, or for the selection to go. tokCardHeld answers the hold of a card, made as it goes up
  function tokCardHeld(card) { return card && typeof pressHold === 'function' && typeof window !== 'undefined' && window && typeof window.addEventListener === 'function' ? pressHold(card, window) : null; }
  function tokCardSelIn(box) {
      try { var s = typeof window !== 'undefined' && window && typeof window.getSelection === 'function' ? window.getSelection() : null; if (!s || s.isCollapsed || !s.rangeCount || !box || typeof box.contains !== 'function') return false; return !!(s.anchorNode && box.contains(s.anchorNode)) || !!(s.focusNode && box.contains(s.focusNode)); } catch (e) { return false; }
  }
  var _tcWait = { card: null, pin: null };
  // false where it may be drawn now; else true, and fn runs again once the press has landed or the selection has gone
  function tokCardWait(box, card, which, fn) {
      var h = tokCardHeld(card);
      if (h && h.busy()) { h.then(fn); return true; }
      if (tokCardSelIn(box)) { _tcWait[which] = fn; return true; }
      _tcWait[which] = null; return false;
  }
  function tokCardSelGone() {   // the selection changed: a redraw that waited for it runs once it is no longer in its card
      ['card', 'pin'].forEach(function(k) { var fn = _tcWait[k]; if (!fn) return; var box = k === 'card' ? tokTip() : document.getElementById('tokCardBody'); if (!tokCardSelIn(box)) { _tcWait[k] = null; fn(); } });
  }
  if (typeof document !== 'undefined' && document && typeof document.addEventListener === 'function') document.addEventListener('selectionchange', tokCardSelGone);
  function tokCardPlace(tt, el) {
      var wrap = document.getElementById('whiteboardWrap'), card = tt.firstElementChild; if (!wrap || !card || !el) return;
      var wb = wrap.getBoundingClientRect(), sL = wrap.scrollLeft, sT = wrap.scrollTop, r = el.getBoundingClientRect();
      card.style.maxWidth = Math.min(320, wb.width - 16) + 'px'; card.style.maxHeight = (wb.height - 16) + 'px';
      tt.style.left = sL + 'px'; tt.style.top = sT + 'px';   // measured at the board's corner, where nothing narrows it
      var cr = tt.getBoundingClientRect(), P = 6;   // the ring of bars and the effect icons stand just outside the token's box
      var p = tokCardSpot({ l: r.left - wb.left + sL - P, t: r.top - wb.top + sT - P, r: r.right - wb.left + sL + P, b: r.bottom - wb.top + sT + P }, cr.width, cr.height, { l: sL + 8, t: sT + 8, r: sL + wb.width - 8, b: sT + wb.height - 8 });
      if (p) { tt.style.left = p.x + 'px'; tt.style.top = p.y + 'px'; }
  }
  function tokCardPut(tt, wItem, el, map) {
      if (window.wpStream) return;   // the stream window shows nothing of it
      tokCardKeep(); _tc.next = null;
      var card = tokCardFor(wItem, el, map, false);
      tt.textContent = ''; tt.appendChild(card); tt.classList.add('tc-on'); tt.style.display = 'block'; _tc.id = wItem.id; tokCardHeld(card);
      tokCardPlace(tt, el);
  }
  function tokElFor(id) { var q = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : String(id).replace(/[^\w-]/g, ''); return document.querySelector('#whiteboard .wb-item[data-id="' + q + '"]'); }
  // A redraw of the board: the card the pointer is on (or on its token) is made again from the figures as they are now; any other goes
  function tokCardRedo() {
      var tt = tokTip(), map = getActiveMap(); if (!tt || !_tc.id || !map) { tokCardDrop(); return; }
      var w = (map.whiteboard || []).find(function(x) { return x && x.id === _tc.id; }), el = w ? tokElFor(w.id) : null, n = window.wpNet;
      if (!w || !el || (w.hidden && n && n.active && n.role === 'client') || !(tt.matches(':hover') || el.matches(':hover'))) { tokCardDrop(); return; }
      var old = tt.firstElementChild; if (tokCardWait(tt, old, 'card', function() { if (tokCardUp()) tokCardRedo(); })) return;   // a press on it, or words of it selected: after
      var left = tt.style.left, top = tt.style.top, onCard = tt.matches(':hover');
      var ob = old && typeof old.querySelector === 'function' ? old.querySelector('.ui-card-body') : null, st = ob ? ob.scrollTop : 0, mw = old && old.style ? old.style.maxWidth : '', mh = old && old.style ? old.style.maxHeight : '';
      var nc = tokCardFor(w, el, map, false);
      tt.textContent = ''; tt.appendChild(nc); tokCardHeld(nc);
      if (onCard) { nc.style.maxWidth = mw; nc.style.maxHeight = mh; tt.style.left = left; tt.style.top = top; } else tokCardPlace(tt, el);   // the card under the pointer stays where it is, held to the room it had
      var nb = typeof nc.querySelector === 'function' ? nc.querySelector('.ui-card-body') : null; if (nb && st) nb.scrollTop = st;   // a long note read part way stays where it was read
  }
  // The pinned card: a small window of its own (floats.js, sheets.js Z_BOXES, esckey.js ESC_LAST), made again whenever the board is drawn
  var _pin = { id: '', map: '' };
  function tokPinEl() { return document.getElementById('tokCardPanel'); }
  function tokPinDraw() {
      var p = tokPinEl(), body = document.getElementById('tokCardBody'); if (!p || !body || !_pin.id || p.style.display === 'none') return false;
      var camp = getActiveCampaign(), map = camp && camp.items ? camp.items[_pin.map] : null, w = map && Array.isArray(map.whiteboard) ? map.whiteboard.find(function(x) { return x && x.id === _pin.id; }) : null, n = window.wpNet;
      if (!w || (w.hidden && n && n.active && n.role === 'client')) { tokPinClose(); return false; }   // the token is gone, or hidden from this player
      var old = body.firstElementChild; if (tokCardWait(body, old, 'pin', function() { tokPinDraw(); })) return true;   // a press on it, or words of it selected: after
      var am = getActiveMap(), ob = typeof body.querySelector === 'function' ? body.querySelector('.ui-card-body') : null, sc = ob ? ob.scrollTop : 0;   // the card's own body scrolls, never the window's
      var nc = tokCardFor(w, am && am.id === map.id ? tokElFor(w.id) : null, map, true);
      body.textContent = ''; body.appendChild(nc); tokCardHeld(nc);
      var nb = typeof nc.querySelector === 'function' ? nc.querySelector('.ui-card-body') : null; if (nb && sc) nb.scrollTop = sc;
      var t = document.getElementById('tokCardTitle'); if (t) t.textContent = w.charName || 'Token';
      return true;
  }
  // [lookcheck:tokredo-end]
  function tokPinOpen(id, mapId) {
      var p = tokPinEl(), tt = tokTip(); if (!p || window.wpStream) return;
      var r = tt && tt.style.display === 'block' ? tt.getBoundingClientRect() : null, was = p.style.display !== 'none';
      _pin.id = id; _pin.map = mapId; tokCardDrop();
      if (!was) {
          var at = { l: r ? r.left : 80, t: r ? r.top : 120, w: 300, h: r ? Math.max(160, r.height + 34) : 360 }, F = window.wpFloats, s = F && typeof F.spot === 'function' ? F.spot(at, false, p) : null;   // where the card stood, kept clear of the map's bars
          p.style.left = Math.max(0, Math.round(s ? s.l : at.l)) + 'px'; p.style.top = Math.max(0, Math.round(s ? s.t : at.t)) + 'px'; p.style.right = 'auto';
          p.style.display = 'flex';
      }
      tokPinDraw();
      if (window.wpFloats && typeof window.wpFloats.reveal === 'function') window.wpFloats.reveal(p);
  }
  function tokPinClose() { var p = tokPinEl(); _pin.id = ''; _pin.map = ''; if (p) { p.style.display = 'none'; var b = document.getElementById('tokCardBody'); if (b) b.textContent = ''; } }
  (function wireTokPin() {
      var p = tokPinEl(), head = document.getElementById('tokCardHead'), x = document.getElementById('tokCardClose'), drag = null; if (!p || !head) return;
      if (x) x.addEventListener('click', tokPinClose);
      head.addEventListener('pointerdown', function(e) { if (e.target.closest('button')) return; var r = p.getBoundingClientRect(); drag = { dx: e.clientX - r.left, dy: e.clientY - r.top }; head.setPointerCapture(e.pointerId); });
      head.addEventListener('pointermove', function(e) { if (!drag) return; p.style.left = (e.clientX - drag.dx) + 'px'; p.style.top = (e.clientY - drag.dy) + 'px'; p.style.right = 'auto'; });
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function(ev) { head.addEventListener(ev, function() { drag = null; }); });   // a drag ends however the pointer is let go
      if (typeof MutationObserver === 'function') new MutationObserver(function() { if (p.style.display === 'none' && _pin.id) { _pin.id = ''; _pin.map = ''; } }).observe(p, { attributes: true, attributeFilter: ['style'] });   // closed by Escape (esckey.js) or anything else: nothing is kept
  })();
  // [sinkcheck:tokfxmenu-start]
  // Conditions C2 (docs/CONDITIONS_PLAN.md): a token's Effects menu — the model's rows (wpSheets.tokenFxModel) as menu lines ticked when
  // applied, a GM-only one marked, one applied but switched off saying so; a click adds the library effect or ends the one applied. A token
  // with no sheet (the GM's) gets a line to make one on the spot. Names escaped; an icon drawn as on the token
  function fxIconHtml(i) {
      var S = window.wpSystemCore, p = S && S.glyphPath ? S.glyphPath(i) : '';
      if (p) return '<i class="wp-glyph" style="-webkit-mask-image:url(&quot;' + FX_GLYPH_BASE + esc(p) + '.svg&quot;);mask-image:url(&quot;' + FX_GLYPH_BASE + esc(p) + '.svg&quot;)"></i>';
      return typeof i === 'string' && i ? esc(i) : '';
  }
  var _fxFind = '';
  function tokenFxMenuHtml(tok, m) {
      var h = '<div class="menu-item" style="color:var(--dim); font-size:10.5px; letter-spacing:.06em; text-transform:uppercase; cursor:default;">Effects &mdash; ' + esc(tok.charName || tok.name || 'Token') + '</div>';
      if (!m.rows.length && m.char) h += '<div class="menu-item" style="color:var(--dim); cursor:default;">No effects in the system&rsquo;s library.</div>';
      if (m.rows.length > 12) h += '<div class="menu-item cm-fx-find"><input class="field cm-fx-q" type="text" placeholder="Find an effect&hellip;" aria-label="Find an effect" maxlength="60"></div><div class="menu-item cm-fx-none" style="display:none; color:var(--dim); cursor:default;">No effect of that name.</div>';   // 1.6.0: a long list has a search at its top
      m.rows.forEach(function(r, k) {
          var inert = r.auto === true && !r.rowId;   // conditions C4: on by its own formula, with no row to end: nothing to click
          h += '<div class="menu-item cm-fx' + (r.on ? ' on' : '') + (inert ? ' auto' : '') + '"' + (inert ? '' : ' data-fi="' + k + '"') + '>' + (r.on ? '&#9745; ' : '&#9744; ') + fxIconHtml(r.icon) + ' ' + esc(r.name) + (r.gm ? ' <span class="cm-fx-tag gm">GM</span>' : '') + (r.auto === true ? ' <span class="cm-fx-tag">auto</span>' : '') + (r.rowId && !r.on ? ' <span class="cm-fx-tag">off</span>' : '') + '</div>';
      });
      if (!m.char) h += '<div class="menu-divider"></div><div class="menu-item cm-fx-new" style="gap:4px; cursor:default;"><input class="field cm-fx-name" maxlength="60" placeholder="New effect&hellip;" style="width:110px;"><select class="field cm-fx-tone"><option value="">Neutral</option><option value="buff">Buff</option><option value="debuff">Debuff</option></select><button class="tool ghost cm-fx-add" type="button">Add</button></div>';
      return h;
  }
  // 1.6.3 (the combat review, finding 21; Fulllion's pick of 2026-11-20: a token's Effects menu gets an optional rounds box beside each effect, which
  // becomes its timer). Beside each effect not on, on the GM's own screen and only for a character token (whose sheet keeps timers), the app's own
  // counter (wpUi.step), 0 to 99 and 0 at first: 0 keeps the effect's own time, any other count is how many rounds it lasts, set on the add
  // (sheets.js tokenFxCharOp, commitEffect). A press on the counter, and a key in its box, stay with it, so the line's own click never fires.
  // Answers a reader of the counts by the line's place: get(k), 0 where nothing was set. get(k) first asks that line's counter to hand on what
  // its box holds now (uiparts.js flush): a figure typed and not yet handed on waits for the end of the press, and the line's click is that very
  // press, so without the flush a count typed and then clicked was read as 0 (the review of combat damage, 2026-11-20)
  function fxRoundsGm() { var n = window.wpNet; return !(n && (n.foreign || (n.active && n.role === 'client'))) && !window.wpStream; }
  function fxRoundsInto(menu, m) {
      var rd = {}, steps = {}, out = { get: function(k) { var s = steps[k]; if (s && typeof s.flush === 'function') s.flush(); return typeof rd[k] === 'number' ? rd[k] : 0; } }, U = window.wpUi;
      if (!menu || !m || !m.char || !fxRoundsGm() || !U || typeof U.step !== 'function' || typeof menu.querySelectorAll !== 'function') return out;
      menu.querySelectorAll('.cm-fx').forEach(function(line) {
          var k = Number(line.dataset && line.dataset.fi), r = m.rows[k]; if (!r || r.rowId || r.auto === true || !(k >= 0)) return;
          var box = document.createElement('span'); box.className = 'cm-fx-rounds'; box.title = 'How many rounds it lasts once you tick it. 0 keeps its own time.';
          var st = U.step({ min: 0, max: 99, value: 0, label: 'Rounds for ' + String(r.name || 'this effect'), lessTip: 'One round less', moreTip: 'One round more', set: function(n) { rd[k] = n; } });
          steps[k] = st;   // kept by the line's place, so get(k) can flush it
          var wd = document.createElement('span'); wd.className = 'cm-fx-rwd'; wd.textContent = 'rounds';   // the word after the counter, found live: inside its box it read "0rounds"
          box.appendChild(st); box.appendChild(wd);
          ['click', 'pointerdown', 'mousedown'].forEach(function(ev) { box.addEventListener(ev, function(e) { e.stopPropagation(); }); });
          box.addEventListener('keydown', function(e) { if (e.key !== 'Escape') e.stopPropagation(); });   // the box's keys are its own; Escape is the router's, which closes the menu
          line.appendChild(box);
      });
      return out;
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
  function showTokenFxMenu(tok, keep) {
      var cMenu = document.getElementById('contextMenu'), S = window.wpSheets; if (!cMenu || !S || !S.tokenFxModel) return;
      var m = S.tokenFxModel(tok); if (!m) { cMenu.style.display = 'none'; return; }
      var fxTop = keep === true ? cMenu.scrollTop : 0;   // an effect pressed leaves the list where it stands; drawn again it would go back to its top
      cMenu.onclick = null;   // its lines answer for themselves: the item menu's handler never sees them
      cMenu.innerHTML = tokenFxMenuHtml(tok, m);
      cMenu.style.display = 'flex';
      placeMenu(cMenu);   // its rows changed while it was up: fitted again where it stands
      var fxR = cMenu.getBoundingClientRect(), fxS = window.wpFloats && window.wpFloats.spot ? window.wpFloats.spot({ l: fxR.left, t: fxR.top, w: fxR.width, h: fxR.height }, true) : null; if (fxS) { cMenu.style.left = fxS.l + 'px'; cMenu.style.top = fxS.t + 'px'; if (fxS.h < fxR.height) { cMenu.classList.add('tall'); cMenu.style.maxHeight = fxS.h + 'px'; } }   // and clear of the bars, as near as it can (floats.js), held to the room it has there: moved down at its full height, its foot ran off a short window
      cMenu.scrollTop = fxTop;
      var qBox = cMenu.querySelector('.cm-fx-q'), findFx = function() {   // the words typed stay across a press, which draws the list again
          _fxFind = qBox ? qBox.value : ''; var w = _fxFind.trim().toLowerCase(), any = false;
          cMenu.querySelectorAll('.cm-fx').forEach(function(line) { var on = !w || line.textContent.toLowerCase().indexOf(w) >= 0; line.style.display = on ? '' : 'none'; if (on) any = true; });
          var noneE = cMenu.querySelector('.cm-fx-none'); if (noneE) noneE.style.display = any ? 'none' : '';
      };
      if (qBox) {
          qBox.value = keep === true ? _fxFind : ''; findFx();
          qBox.addEventListener('click', function(ce) { ce.stopPropagation(); });
          qBox.addEventListener('input', findFx);
          qBox.addEventListener('keydown', function(ke) {
              if (ke.key === 'Escape') return;   // the router's: it closes the menu
              ke.stopPropagation();
              if (ke.key === 'Enter') { var firstL = [].slice.call(cMenu.querySelectorAll('.cm-fx')).filter(function(x) { return x.style.display !== 'none'; })[0]; if (firstL) firstL.click(); }
          });
          qBox.focus({ preventScroll: true });
      }
      var again = function() { setTimeout(function() { if (cMenu.style.display !== 'none') showTokenFxMenu(tok, true); }, 0); };
      var fxRd = fxRoundsInto(cMenu, m);   // 1.6.3 (finding 21): what was typed beside each effect, by its place in the list
      cMenu.querySelectorAll('.cm-fx').forEach(function(line) {
          line.addEventListener('click', function(ce) { ce.stopPropagation(); var k = Number(line.dataset.fi), r = m.rows[k]; if (!r) return; var qa = { op: 'add', ref: r.ref }, nR = fxRd.get(k); if (nR > 0) qa.rounds = nR; tokenFxOp(tok, m, r.rowId ? { op: 'remove', rowId: r.rowId } : qa); again(); });
      });
      var nm = cMenu.querySelector('.cm-fx-name'), tn = cMenu.querySelector('.cm-fx-tone'), add = cMenu.querySelector('.cm-fx-add');
      [nm, tn, cMenu.querySelector('.cm-fx-new')].forEach(function(x) { if (x) x.addEventListener('click', function(ce) { ce.stopPropagation(); }); });
      if (add) add.addEventListener('click', function(ce) { ce.stopPropagation(); var v = nm ? nm.value.trim() : ''; if (!v) return; tokenFxOp(tok, m, { op: 'new', name: v, tone: tn ? tn.value : '' }); again(); });
  }
  // [sinkcheck:tokfxmenu-end]
  // [sinkcheck:rangelabel-start]
  // Range penalties R1 (docs/RANGE_PLAN.md): the modifier the system's range rule gives, on every ruler (range is distance alone) and at each
  // target mark, from its targeter's token as its cover is. Between two character tokens it is measured center to center, with their elevation
  // when that feature is on, as a roll will read it (R2). Worked out on this screen from its own copy of the map: nothing on the wire. A number
  // and a unit's short name, never a name from a file
  function rangeSeen(map, a, b, tA, tB) {   // { mod, dist, unit } or null: no rule, no map
      var S = window.wpSystemCore, sys = window.wpSheets && window.wpSheets.systemOf ? window.wpSheets.systemOf() : null; if (!S || !S.rangeOf || !sys || !map) return null;
      var dz = tA && tB && stanceOn('elevation') ? tokenElevation(tB, map) - tokenElevation(tA, map) : 0;   // item 19b H5: each on the ground it stands on
      return S.rangeOf(sys, map, a, b, { F: window.wpFormula, dz: dz });
  }
  function rangeModText(m) { return typeof m !== 'number' || !isFinite(m) ? '' : m < 0 ? '\u2212' + String(-m) : m > 0 ? '+' + String(m) : '0'; }
  // 1.6.0, backlog 30 (the owner's ruling: the ruler keeps its numbers and gains a switch that shows the band's name instead, the same at a
  // target mark): this computer's own choice (wp_rangeNames), a band's name where its step has one, else the modifier as before
  function rangeNamesOn() { try { return typeof localStorage !== 'undefined' && localStorage.getItem('wp_rangeNames') === '1'; } catch (e) { return false; } }
  function rangeWord(rg) { return rangeNamesOn() && typeof rg.band === 'string' && rg.band ? rg.band : rangeModText(rg.mod); }
  var RANGE_UNIT_WORD = { yd: 'yd', ft: 'ft', m: 'm', cells: 'cells' };
  // A target mark's tooltip says the distance in the viewer's own unit (1.5.4, the review of the v1.0.4 merge; docs/V104_PLAN.md gap 2): a rule
  // that counts in yards or feet reads in meters under Metric, and one in meters reads in yards under Imperial, by the exact definitions, as a
  // height does; cells as they are, and with no setting at hand the rule's own unit. Only what is said changes: the modifier is the rule's
  function rangeTitle(rg) {
      var u = Object.prototype.hasOwnProperty.call(RANGE_UNIT_WORD, rg.unit) ? RANGE_UNIT_WORD[rg.unit] : 'yd', d = rg.dist, mo = typeof metricOn === 'function' ? metricOn() : null;
      if (mo === true && (u === 'yd' || u === 'ft')) { d = d * (u === 'yd' ? 0.9144 : 0.3048); u = 'm'; } else if (mo === false && u === 'm') { d = d / 0.9144; u = 'yd'; }
      return 'Range ' + (typeof rg.band === 'string' && rg.band ? rg.band + ' ' : '') + rangeModText(rg.mod) + ' (' + (Math.round(d * 10) / 10) + ' ' + u + ')';
  }
  function rulerRangeText(x, y, rg) { return rg ? '<text x="' + x + '" y="' + y + '">Range ' + esc(rangeWord(rg)) + '</text>' : ''; }
  function targetRangeHtml(markHtml, rg) { var nm = rg && rangeNamesOn() && typeof rg.band === 'string' && rg.band; return rg && (rg.mod !== 0 || nm) ? '<span class="target-pair">' + markHtml + '<span class="target-range" title="' + esc(rangeTitle(rg)) + '">' + esc(rangeWord(rg)) + '</span></span>' : markHtml; }
  // [sinkcheck:rangelabel-end]
  // [sinkcheck:heightlabel-start]
  // Item 19 H2 (the owner's answer: shown on the ruler and at a target mark): the system's height modifier between two character tokens — the
  // first's height over the second's, as a roll's HeightMod reads it — on the ruler and at each target mark from its targeter's token. Worked
  // out on this screen; its words a number and the viewer's own unit (yards or meters), never a name from a file
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
  // [vehiclecheck:travel-start]
  // 1.6.2 (backlog 166 a): how long the trip along a ruler takes on a map whose kind ticks Ruler shows travel time (systemcore travelOf), in the
  // calendar's own units. A ruler placed where another ends is a leg of one route, and the route's last leg says its total too. A ruler started
  // on a token whose sheet this screen holds reads that sheet's own speed first. Plain text, which the caller escapes
  function travelSecsOf(sys) {
      var CC = window.wpCalendarCore, cal = sys && sys.calendar ? sys.calendar : null, cc = CC && CC.cleanCalendar ? (CC.cleanCalendar(cal) || {}) : {}, S = cc.seconds || 60, M = cc.minutes || 60, SCt = window.wpSystemCore;
      return { round: SCt && typeof SCt.roundSecs === 'function' ? SCt.roundSecs(sys) : 6, minute: S, hour: M * S, day: CC && CC.dayLength ? CC.dayLength(cal) : 86400 };
  }
  function travelWords(sys, secs) {
      var CC = window.wpCalendarCore, u = travelSecsOf(sys), step = secs >= u.day ? u.hour : secs >= u.minute ? u.minute : 1, r = Math.max(step, Math.round(secs / step) * step);
      return CC && CC.fmtSpan ? CC.fmtSpan(sys && sys.calendar ? sys.calendar : null, r) : Math.round(r) + ' seconds';
  }
  function rulerRoute(all, m) { var route = [m], cur = m, guard = 0; while (guard++ < 50) { var c0 = cur, prev = all.filter(function(o) { return o !== c0 && route.indexOf(o) < 0 && Math.hypot(o.x2 - c0.x1, o.y2 - c0.y1) <= 8; })[0]; if (!prev) break; route.unshift(prev); cur = prev; } return route; }
  function rulerTravel(map, m, all) {
      var SCt = window.wpSystemCore, sys = window.wpSheets && window.wpSheets.systemOf ? window.wpSheets.systemOf() : null, kind = map && map.meta && typeof map.meta.kind === 'string' ? map.meta.kind : '';
      if (!SCt || typeof SCt.travelOf !== 'function' || !sys || !kind) return [];
      var route = rulerRoute(all, m), last = !all.some(function(o) { return o !== m && route.indexOf(o) < 0 && Math.hypot(o.x1 - m.x2, o.y1 - m.y2) <= 8; }), tot = 0;
      route.forEach(function(r) { tot += boardYards(r.x1, r.y1, r.x2, r.y2); });
      var t0 = tokenAtPoint(map, route[0].x1, route[0].y1), camp = getActiveCampaign(), ch = t0 && typeof t0.charId === 'string' && camp && camp.chars && Object.prototype.hasOwnProperty.call(camp.chars, t0.charId) ? camp.chars[t0.charId] : null;
      var secs = travelSecsOf(sys), legs = SCt.travelOf(sys, kind, boardYards(m.x1, m.y1, m.x2, m.y2), ch, window.wpFormula, secs), tots = route.length > 1 && last ? SCt.travelOf(sys, kind, tot, ch, window.wpFormula, secs) : null, who = ch && typeof ch.name === 'string' ? ch.name : '';
      return legs.map(function(x) { var t = tots ? tots.filter(function(y) { return y.key === x.key; })[0] : null; return x.label + (x.own && who ? ' (' + who + ')' : '') + ': ' + travelWords(sys, x.secs) + (t ? ', route ' + travelWords(sys, t.secs) : ''); });
  }
  // [vehiclecheck:travel-end]
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
  // [vehiclecheck:tagsdraw-start] 1.6.2 (vehicles, fold (c); the owner, by prompt: "A line and a tag"): each mark this screen holds drawn as a dashed line from
  // the token that holds it to the one it is on, its name a tag at the middle, with SVG elements made by name and text nodes only (a mark's name is a system's).
  // The GM's tag takes the mark off at a press
  function tagsDraw(map) {
      var layer = document.getElementById('tagLayer'); if (!layer) return;
      while (layer.firstChild) layer.removeChild(layer.firstChild);
      var S = window.wpSystemCore, camp = getActiveCampaign(), n = window.wpNet; if (!S || !map || !Array.isArray(map.whiteboard) || !camp || !camp.system || !Array.isArray(camp.system.tags) || !n || typeof n.tagsOf !== 'function') return;
      var list = n.tagsOf(map); if (!Array.isArray(list) || !list.length) return;
      var byId = Object.create(null); map.whiteboard.forEach(function(w) { if (w && typeof w.id === 'string' && !w.waiting) byId[w.id] = w; });
      var NS = 'http://www.w3.org/2000/svg', gmT = !(typeof playerScreen === 'function' && playerScreen()) && !state.streamMode, cen = function(w) { var ww = typeof w.w === 'number' && w.w > 0 ? w.w : 60, hh = typeof w.h === 'number' && w.h > 0 ? w.h : 52; return [Number(w.x) + ww / 2, Number(w.y) + hh / 2]; };
      list.forEach(function(t) {
          var a = byId[t.by], b = byId[t.on], d = S.tagOf(camp.system, t.k); if (!a || !b || !d) return;
          var pa = cen(a), pb = cen(b); if (![pa[0], pa[1], pb[0], pb[1]].every(function(x) { return isFinite(x); })) return;
          var g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'tag-mark');
          var ln = document.createElementNS(NS, 'line'); ln.setAttribute('x1', String(pa[0])); ln.setAttribute('y1', String(pa[1])); ln.setAttribute('x2', String(pb[0])); ln.setAttribute('y2', String(pb[1])); g.appendChild(ln);
          var dt = document.createElementNS(NS, 'circle'); dt.setAttribute('cx', String(pb[0])); dt.setAttribute('cy', String(pb[1])); dt.setAttribute('r', '5'); g.appendChild(dt);
          var tx = document.createElementNS(NS, 'text'); tx.setAttribute('x', String((pa[0] + pb[0]) / 2)); tx.setAttribute('y', String((pa[1] + pb[1]) / 2 - 6)); tx.setAttribute('text-anchor', 'middle'); tx.textContent = d.label;
          if (gmT) { tx.setAttribute('class', 'tag-mark-off'); var tt = document.createElementNS(NS, 'title'); tt.textContent = 'Take ' + d.label + ' off'; tx.appendChild(tt); tx.addEventListener('click', function(e) { e.stopPropagation(); if (n.tagsTakeOff(map.id, t)) toast(d.label + ' taken off.'); }); }
          g.appendChild(tx); layer.appendChild(g);
      });
  }
  // [vehiclecheck:tagsdraw-end]
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
          var cpW = window.wpCompass && typeof window.wpCompass.rulerWay === 'function' ? window.wpCompass.rulerWay(m.x1, m.y1, m.x2, m.y2) : '';   // 1.6.2, backlog 82: the way it points by the map's compass
          html += '<text x="' + (mx + 8) + '" y="' + (my - 8) + '">' + measureLabel(dist, diagCells(m)) + esc(cpW) + (prR ? ' \u00b7 ' + esc(prR) : '') + '</text>';
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
          var tvY = _covY + (labCov ? 19 : 0) + (litR ? 19 : 0) + (rgR ? 19 : 0) + (mcR ? 19 : 0) + (hgR ? 19 : 0);   // 1.6.2 (backlog 166 a): how long the trip takes
          rulerTravel(amR, m, all).forEach(function(s, k) { html += '<text x="' + (mx + 8) + '" y="' + (tvY + k * 19) + '">' + esc(s) + '</text>'; });
          html += '</g>';

      });

      layer.innerHTML = html + blastSvg();
      applyBlastHits();

  }

  // [lookcheck:rulerpass-start]
  // 1.6.0 (the by-hand test of 2026-10-30): a ruler left on the map measures, and a token is what is played: a press on a ruler over a token goes to the
  // token. The press is handed on as the board hands a press on (datamap.js handOn), so the ruler stays and the token is dragged
  function rulerToken(x, y) {
      var els = document.elementsFromPoint ? document.elementsFromPoint(x, y) : [], map = getActiveMap(), list = map && Array.isArray(map.whiteboard) ? map.whiteboard : [];
      for (var i = 0; i < els.length; i++) {
          var el = els[i] && els[i].closest ? els[i].closest('#whiteboard .wb-item') : null, id = el && el.dataset ? el.dataset.id : '';
          if (id && list.some(function(w) { return !!w && w.id === id && w.isChar; })) return el;
      }
      return null;
  }
  // [lookcheck:rulerpass-end]
  var _rulerPass = false;
  (function wireMeasureClicks() {
      var layer = document.getElementById('measureLayer');
      if (!layer) return;
      layer.addEventListener('pointerdown', function(e) {
          _rulerPass = false;
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
              var tkB = !window.isMeasureMode ? rulerToken(e.clientX, e.clientY) : null;   // a token under a blast takes the press, as under a ruler: found by hand, a drag meant for a token moved the blast
              if (tkB) { _rulerPass = true; e.stopPropagation(); e.preventDefault(); tkB.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: e.pointerId, pointerType: e.pointerType, isPrimary: e.isPrimary, clientX: e.clientX, clientY: e.clientY, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, altKey: e.altKey, metaKey: e.metaKey })); return; }
              var bi0 = parseInt(gbd.dataset.i, 10);
              if (bi0 >= 0 && bi0 < blasts.length && typeof blasts[bi0].tok !== 'string') { blastDrag = { i: bi0, sx: e.clientX, sy: e.clientY, ox: blasts[bi0].x, oy: blasts[bi0].y, moved: false }; e.preventDefault(); }   // a circle on a token is not dragged: it goes where its token goes
              e.stopPropagation(); return;
          }
          var gmP = e.target.closest('g.measure');
          if (gmP && e.button === 0 && !window.isMeasureMode && !gmP.classList.contains('live')) {
              var tkP = rulerToken(e.clientX, e.clientY);
              if (tkP) { _rulerPass = true; e.stopPropagation(); e.preventDefault(); tkP.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: e.pointerId, pointerType: e.pointerType, isPrimary: e.isPrimary, clientX: e.clientX, clientY: e.clientY, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, altKey: e.altKey, metaKey: e.metaKey })); return; }
          }
          if ((gmP && !(window.isMeasureMode && window.wpMeasureKind === 'ruler')) || gbd) e.stopPropagation();   // with the ruler in hand a placed ruler is in no one's way: a new one starts on it
      });
      // Right-click a blast to remove it
      layer.addEventListener('contextmenu', function(e) {
          var gbc = e.target.closest && e.target.closest('g.blast'); if (!gbc) return;
          e.preventDefault(); e.stopPropagation();
          var tkC = !window.isMeasureMode ? rulerToken(e.clientX, e.clientY) : null;   // a token under a blast keeps its menu, as it takes the left press: found by hand, a right-click meant for the token removed the blast
          if (tkC) { tkC.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, buttons: 2, clientX: e.clientX, clientY: e.clientY, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, altKey: e.altKey, metaKey: e.metaKey })); return; }
          var bic = parseInt(gbc.dataset.i, 10);
          if (bic >= 0 && bic < blasts.length) { var goneB = blasts.splice(bic, 1)[0]; if (ownCircle(goneB)) circleRekept(); blastGone(goneB); renderMeasures(); syncBlastMenu(); toast(!ownCircle(goneB) ? 'Blast removed.' : goneB.as === 'ring' ? 'Ring removed.' : goneB.as === 'cone' ? 'Cone removed.' : 'Circle removed.'); }
      });
      document.addEventListener('pointermove', function(e) {
          if (coneAim) { coneTurn(e); return; }
          if (!blastDrag) return;
          var bm = blasts[blastDrag.i]; if (!bm) { blastDrag = null; return; }
          if (!blastDrag.moved && Math.hypot(e.clientX - blastDrag.sx, e.clientY - blastDrag.sy) < 4) return;
          blastDrag.moved = true;
          bm.x = blastDrag.ox + wbDX(e.clientX - blastDrag.sx, e.clientY - blastDrag.sy);   // 1.6.3 (the review, finding 7): the step on screen as a step on the board, turned view or not
          bm.y = blastDrag.oy + wbDY(e.clientX - blastDrag.sx, e.clientY - blastDrag.sy);
          renderMeasures();
      });
      document.addEventListener('pointerup', function() {
          if (coneAim) { coneLetGo(); return; }
          if (!blastDrag) return;
          var bu = blasts[blastDrag.i], movedU = blastDrag.moved; blastDrag = null;
          if (!bu || !movedU) return;
          seatBlast(bu); renderMeasures(); syncBlastMenu(); blastMoved(bu);
      });
      layer.addEventListener('click', function(e) {
          if (e.target.closest && e.target.closest('g.blast')) { e.stopPropagation(); return; }   // blasts: drag moves, right-click removes
          var g = e.target.closest && e.target.closest('g.measure');
          if (!g || g.classList.contains('live')) return;
          if (_rulerPass) { _rulerPass = false; e.stopPropagation(); return; }   // this press went to the token under the ruler
          var i = parseInt(g.dataset.i, 10);
          if (i >= 0 && i < measures.length) { measures.splice(i, 1); renderMeasures(); toast('Ruler removed.'); }
          e.stopPropagation();
      });
  })();

  function blastMoved(b) {   // a blast the table was told of, moved by the GM: the map's blasts told again, since a copy has no id to move it by
      var n = window.wpNet; if (!b || !b.wire || !n || !n.active || n.role !== 'host' || !n.broadcastBlast || !n.broadcastBlastClear) return;
      b.wire.x = b.x; b.wire.y = b.y; if (typeof b.elev === 'number') b.wire.elev = b.elev;
      n.broadcastBlastClear(b.wireMap); blasts.forEach(function(x) { if (x.wire && x.wireMap === b.wireMap) n.broadcastBlast(x.wire, x.wireMap, x.wireChar); });
  }
  function blastGone(b) {   // a blast the table was told of, taken away by the GM: found by hand, it stayed on a player's screen. The map's blasts told again, without it
      var n = window.wpNet; if (!b || !b.wire || !n || !n.active || n.role !== 'host' || !n.broadcastBlast || !n.broadcastBlastClear) return;
      n.broadcastBlastClear(b.wireMap); blasts.forEach(function(x) { if (x.wire && x.wireMap === b.wireMap) n.broadcastBlast(x.wire, x.wireMap, x.wireChar); });
  }
  function clearMeasures() { measures = []; activeMeasure = null; renderMeasures(); }

  window.appClearMeasures = clearMeasures;

  function measurePoint(e) {

      var box = wbWrap.getBoundingClientRect();

      var x = wbX(e.clientX, e.clientY, box, wbWrap);

      var y = wbY(e.clientX, e.clientY, box, wbWrap);

      return getSnapCoords(x, y);

  }

  var _el_measureModeBtn = document.getElementById('measureModeBtn');

  var _el_measureMenu = document.getElementById('measureMenu');

  // 1.6.2 (vehicles, fold (g); the owner: "a toggle that switches any map to a vehicle map"): the map's kind, from the system's map kinds, the GM's
  // own. Picking one sets the map's cell to the kind's, which the GM may change after; Personal scale takes the kind off. Nothing on the map moves
  function mapKindSync() {
      var row = document.getElementById('measureKindRow'), lab = document.getElementById('measureKindLabel'), sel = document.getElementById('measureKind'); if (!row || !sel) return;
      var camp = getActiveCampaign(), ks = camp && camp.system && Array.isArray(camp.system.mapKinds) ? camp.system.mapKinds.filter(function(k) { return k && typeof k.key === 'string'; }) : [], m = getActiveMap();
      row.hidden = !ks.length; if (lab) lab.hidden = !ks.length; if (!ks.length) return;
      var cur = m && m.meta && typeof m.meta.kind === 'string' ? m.meta.kind : '', sig = JSON.stringify([ks.map(function(k) { return [k.key, k.label]; }), cur]);
      if (sel.dataset.sig === sig) return; sel.dataset.sig = sig; while (sel.firstChild) sel.removeChild(sel.firstChild);
      var opt = function(v, t) { var o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); };
      opt('', 'Personal scale'); ks.forEach(function(k) { opt(k.key, (k.label || k.key) + ' scale'); }); if (cur && !ks.some(function(k) { return k.key.toLowerCase() === cur.toLowerCase(); })) opt(cur, 'A kind the system no longer names');
      sel.value = ks.filter(function(k) { return k.key.toLowerCase() === cur.toLowerCase(); }).map(function(k) { return k.key; })[0] || cur;
  }
  (function() {
      var sel = document.getElementById('measureKind'); if (!sel) return;
      sel.addEventListener('change', function() {
          var m = getActiveMap(), camp = getActiveCampaign(); if (!m || !m.meta || !camp) return;
          var ks = camp.system && Array.isArray(camp.system.mapKinds) ? camp.system.mapKinds : [], k = ks.filter(function(x) { return x && typeof x.key === 'string' && x.key === sel.value; })[0] || null;
          if (k) { m.meta.kind = k.key; if (k.scale && typeof k.scale.per === 'number') { m.meta.cellValue = k.scale.per; m.meta.cellUnit = k.scale.unit; } } else delete m.meta.kind;
          sel.dataset.sig = ''; save(); renderMeasures(); syncMeasureMenu(); if (window.wpMapTabs && typeof window.wpMapTabs.sync === 'function') window.wpMapTabs.sync();
          toast(k ? 'This map is now at ' + (k.label || k.key) + ' scale' + (k.scale ? ', 1 cell = ' + k.scale.per + ' ' + k.scale.unit : '') + '.' : 'This map is now at the personal scale.');
      });
  })();
  function syncMeasureMenu() {
      if (window.wpCompass && typeof window.wpCompass.menuSync === 'function') window.wpCompass.menuSync();   // 1.6.2, backlog 82: the Compass part
      if (window.wpCellSize && typeof window.wpCellSize.menuSync === 'function') window.wpCellSize.menuSync();   // 1.6.2, backlog 38: the map's own cell

      document.querySelectorAll('#measureUnitRow .draw-style-btn').forEach(function(b) {

          b.classList.toggle('active', b.dataset.unit === (state.measureUnit || 'imperial'));

      });

      var cfg = mapMeasureConfig();

      var vEl = document.getElementById('measureCellValue');

      var uEl = document.getElementById('measureCellUnit');

      if (vEl && document.activeElement !== vEl) vEl.value = cfg.per;

      if (uEl && document.activeElement !== uEl) uEl.value = cfg.unit;
      if (typeof mapKindSync === 'function') mapKindSync();   // 1.6.2 (vehicles, fold (g))

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

  // 1.6.0, backlog 30: Range shows, the modifier or the band's name, this computer's own
  function rangeShowSync() { var on = rangeNamesOn(); document.querySelectorAll('#rangeShowRow .draw-style-btn').forEach(function(b) { b.classList.toggle('active', (b.dataset.rshow === 'name') === on); }); }
  document.querySelectorAll('#rangeShowRow .draw-style-btn').forEach(function(b) {
      b.addEventListener('click', function() { try { if (this.dataset.rshow === 'name') localStorage.setItem('wp_rangeNames', '1'); else localStorage.removeItem('wp_rangeNames'); } catch (e) {} rangeShowSync(); render(); renderMeasures(); });
  });
  rangeShowSync();
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
  // 1.6.3 (the split, area 8 of docs/REFACTOR_SPLIT_PLAN.md): the Radius tool's and the thrown blasts' state stands here, in whiteboard.js,
  // since the board's own pointer handlers above set and read it, and the blasts' code below (wbblast.js, a part of this file) sets it
  // through these setters: a part may not assign a name of its root, which it reads through a live import. A setter only assigns.
  // blasts: every circle of the Radius tool and every thrown blast on the map on screen (pushBlast keeps it to BLAST_CAP);
  // coneAim: the cone being turned, { b, sx, sy, moved, fresh } (fresh: just placed, not yet said);
  // blastDrag: { i, sx, sy, ox, oy, moved } while a blast is being dragged.
  var blasts = [], coneAim = null, blastDrag = null;
  function blastsSet(v) { blasts = v; }
  function coneAimSet(v) { coneAim = v; }
// [split:wbblast.js]
var _wbBlast = wbBlast(), BLAST_CAP = _wbBlast.BLAST_CAP, applyBlastHits = _wbBlast.applyBlastHits, blastRadiusYd = _wbBlast.blastRadiusYd, blastSvg = _wbBlast.blastSvg, blastsMapSwitch = _wbBlast.blastsMapSwitch, boardYards = _wbBlast.boardYards, cellSnap = _wbBlast.cellSnap, cellYards = _wbBlast.cellYards, circleRekept = _wbBlast.circleRekept, closeBlastMenu = _wbBlast.closeBlastMenu, coneLetGo = _wbBlast.coneLetGo, coneTurn = _wbBlast.coneTurn, disarmThrow = _wbBlast.disarmThrow, hexCellOf = _wbBlast.hexCellOf, hexDist = _wbBlast.hexDist, mineOff = _wbBlast.mineOff, mineRow = _wbBlast.mineRow, ownCircle = _wbBlast.ownCircle, placeBlast = _wbBlast.placeBlast, placeFx = _wbBlast.placeFx, playerScreen = _wbBlast.playerScreen, pointInPoly = _wbBlast.pointInPoly, pushBlast = _wbBlast.pushBlast, seatBlast = _wbBlast.seatBlast, syncBlastMenu = _wbBlast.syncBlastMenu, texListKeys = _wbBlast.texListKeys, texListPick = _wbBlast.texListPick, texOptionsInto = _wbBlast.texOptionsInto, texTileOf = _wbBlast.texTileOf, tileRowSync = _wbBlast.tileRowSync, tileRowWire = _wbBlast.tileRowWire, tokenAtPoint = _wbBlast.tokenAtPoint, tokenCentre = _wbBlast.tokenCentre, ydPer = _wbBlast.ydPer;   // [split:glue]

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

  // 1.6.3 (the split, area 8 of docs/REFACTOR_SPLIT_PLAN.md): the Image Library's state that the Campaign Cast's roster below reads and
  // sets stands here, in whiteboard.js, and the library's code (wbimglib.js, a part of this file) sets it through these setters: a part
  // may not assign a name of its root. A setter only assigns. _imgLibPick: a callback waiting for a picture (a planner's picture block,
  // a sheet's portrait or look); _castSel and _castOrder: the Campaign Cast's picks (cast = tokens, not images), and the shown order for
  // Shift-click runs (the roster below sets it).
  var _imgLibPick = null, _castSel = {}, _castOrder = [];
  function imgLibPickSet(v) { _imgLibPick = v; }
  function castSelSet(v) { _castSel = v; }

// [split:wbimglib.js]
var _wbImgLib = wbImgLib(), picGoneSoon = _wbImgLib.picGoneSoon, uploadImageFile = _wbImgLib.uploadImageFile;   // [split:glue]
  // [furncheck:drop-start] 1.6.2 (backlog 222): a furnishing dragged from Build's Objects tab, its middle where it is let go, with the rules a
  // map object that names its kind gives it (furnish.js propsOf), seated on the lattice where Snap is on
  function furnDropAt(str, e) {
      var FS = window.wpFurnish, F = window.wpFurnCore, f = FS && F ? FS.read(str) : null; if (!f) return;
      var am = getActiveMap(); if (!am || am.type !== 'map' || state.viewMode !== 'visual') { toast('Open a play map first.'); return; }
      if (!window.wpCanPersistLocal || !window.wpCanPersistLocal()) { toast('Not while you\'re at someone else\'s table.'); return; }
      var p = FS.propsOf(f); if (!p) return;
      var r = wbWrap.getBoundingClientRect(), x = wbX(e.clientX, e.clientY, r, wbWrap) - p.w / 2, y = wbY(e.clientX, e.clientY, r, wbWrap) - p.h / 2;
      var GS = window.wpSnapOn && window.wpSnapOn() && window.wpLatticeOf ? window.wpLatticeOf(am) : null;
      if (GS && GS.type === 'square' && GS.size > 0) { var ox = GS.ox || 0, oy = GS.oy || 0; x = Math.round((x - ox) / GS.size) * GS.size + ox; y = Math.round((y - oy) / GS.size) * GS.size + oy; }
      else if (GS && GS.type === 'hex' && typeof snapToHex === 'function') { var hc = snapToHex(x + p.w / 2, y + p.h / 2, 30, 'center'); x = hc.x - p.w / 2; y = hc.y - p.h / 2; }
      var it = Object.assign({ id: 'wb' + uid(), type: 'image', z: 10 }, newOpacityProps(), p, { x: Math.max(10, Math.round(x)), y: Math.max(10, Math.round(y)) });
      am.whiteboard = am.whiteboard || []; am.whiteboard.push(it);
      state.selWbId = it.id; state.selWbIds = [];
      save(); render(); toast('Placed ' + p.name + '.');
  }
  // [furncheck:drop-end]

  /* ---------- Global Tools ---------- */

  var _el_wbCenterBtn = document.getElementById('wbCenterBtn');
  var _el_wbCenterMenu = document.getElementById('wbCenterMenu');
  var _el_wbCenterCanvasBtn = document.getElementById('wbCenterCanvasBtn');
  var _el_wbCenterItemsBtn = document.getElementById('wbCenterItemsBtn');

  // [placescheck:centeritems-start]
  // 1.6.3 (the review of findings 3 and 7): the Center menu's pieces and where it puts the camera. centerItemsOf is what Center on items
  // frames and what its row is offered by: on the Data Map the rooms; on the play map every piece, but on a player's app no light marker
  // (they are never framed, as Shift+1 leaves them out) and, on a fogged map, only the pieces they have seen or remember (fog.js seenJudge,
  // null on the GM's screen and wherever fog does not apply), so the button never moves a player's camera to the middle of the GM's whole
  // layout. dataView: the Data Map is on screen; n: window.wpNet; Fog: window.wpFog. centerWrapOn scrolls a wrap so a board point stands in
  // its middle, through view.js's place (where a turned view draws it), else the plain reading b * zoom - half the wrap
  function centerItemsOf(m, dataView, n, Fog) {
      var items = (m ? (dataView ? m.rooms : m.whiteboard) : null) || [];
      if (dataView) return items;
      if (n && n.active && n.role === 'client') items = items.filter(function(w) { return !(w && w.type === 'light'); });
      var seen = Fog && typeof Fog.seenJudge === 'function' ? Fog.seenJudge(m) : null;
      return seen ? items.filter(function(w) { return seen(w); }) : items;
  }
  function centerWrapOn(wrap, bx, by) {
      if (!wrap) return;
      if (window.wpView && typeof window.wpView.place === 'function') { window.wpView.place(wrap, bx, by, wrap.clientWidth / 2, wrap.clientHeight / 2); return; }
      var z = state.zoomLevel || 1; wrap.scrollLeft = bx * z - wrap.clientWidth / 2; wrap.scrollTop = by * z - wrap.clientHeight / 2;
  }
  // [placescheck:centeritems-end]

  if(_el_wbCenterBtn) _el_wbCenterBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      var m = getActiveMap(); if(!m || m.type === 'planner') return;
      var items = centerItemsOf(m, state.viewMode === 'data', window.wpNet, window.wpFog);
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
          charBtn.textContent = isClientC ? 'Center on My Character' : (tok ? 'Center on ' + (tok.charName || 'Character') : 'Center on character');
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
      if (window.wpView && window.wpView.place) window.wpView.place(wrap, tok.x + (tok.w || 100) / 2, tok.y + (tok.h || 100) / 2, wrap.clientWidth / 2, wrap.clientHeight / 2);   // 1.6.3 (the review, finding 7): centered where a turned view draws it
      else {
      wrap.scrollLeft = ((tok.x + (tok.w || 100) / 2) * state.zoomLevel) - wrap.clientWidth / 2;
      wrap.scrollTop = ((tok.y + (tok.h || 100) / 2) * state.zoomLevel) - wrap.clientHeight / 2;
      }
      if (!(window.wpNet && window.wpNet.active && window.wpNet.role === 'client')) { state.selWbId = tok.id; state.selWbIds = [tok.id]; render(); }
      if (_el_wbCenterMenu) _el_wbCenterMenu.classList.remove('show');
      toast('Centered on ' + (tok.charName || 'your character') + '.');
  });

  if(_el_wbCenterCanvasBtn) _el_wbCenterCanvasBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      var wrap = state.viewMode === 'data' ? document.getElementById('canvasWrap') : document.getElementById('whiteboardWrap');
      centerWrapOn(wrap, 15000, 15000);   // 1.6.3: the board's middle, where a turned view draws it (the Data Map's wrap is never turned)
      if(_el_wbCenterMenu) _el_wbCenterMenu.classList.remove('show');
      toast('Camera centered on canvas.');
  });

  if(_el_wbCenterItemsBtn) _el_wbCenterItemsBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      var m = getActiveMap(); if(!m || m.type === 'planner') return;
      var items = centerItemsOf(m, state.viewMode === 'data', window.wpNet, window.wpFog);   // 1.6.3: a player's seen pieces alone, never a light marker
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
          centerWrapOn(wrap, curCenterX, curCenterY);   // 1.6.3 (the review of finding 7's fix): where a turned view draws it
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

      this.dataset.tip = sb.classList.contains('collapsed') ? 'Show the left panel' : 'Hide the left panel'; this.removeAttribute('title');   // what a press does now (tooltips.js reads data-tip: one tooltip, never two); the arrow turns by its aria-expanded, which leftrail.js writes
      if (window.wpLeftRail) window.wpLeftRail.toggled();   // the panel's three states are leftrail.js's: folded it leaves a rail, and on the play map docking it is pinning it

  });



  /* Properties sidebar: closed by default, opens when something is selected (a
     room on the data map, an item on the play map) and closes again when the
     selection clears. A hand open or close wins until the selection changes.
     1.6.2: the Properties tab at the map's edge is gone (the owner, at the click test of the layout editor: "honstely we dont need the button
     anymore since properties is easily reached from other options now"), so the bar laid along the right edge sits flush. The panel opens
     from Properties on the right-click menu (a room's on the Data Map too, and a link's own menu there) and the selection bar, never by a
     double-click, and closes by its own X (layers.js propWire). */
  window.wpSelKey = function() { return state.viewMode === 'data' ? (state.selId ? 'r:' + state.selId : (state.selLink != null ? 'l:' + state.selLink : '')) : (state.selWbId ? 'w:' + state.selWbId : ''); };
  function rightShown(sb) { return !!sb && sb.style.display !== 'none'; }   // a planner on screen has no Properties (main.js render)
  window.wpSyncRightPanel = function() {
      var sb = document.getElementById('sidebar');
      if (!rightShown(sb)) return;
      var key = window.wpSelKey();
      if (state.rightManualKey !== undefined && state.rightManualKey !== key) state.rightManualKey = undefined;   // selection moved on: automation resumes
      if (state.rightManualKey !== undefined) return;
      // Properties no longer auto-OPENS on a single click. It opens from Properties on the right-click menu and on the selection bar (wpOpenRightPanel below; 1.6.2, backlog 229).
      // A plain click that clears the selection, or moves it to a different item while a double-click panel is open, dismisses that panel.
      if (!key) { if (state.rightAuto || !state.rightEverSynced) { sb.classList.add('collapsed'); state.rightAuto = false; } }
      else if (state.rightAuto && key !== state.rightAutoKey) { sb.classList.add('collapsed'); state.rightAuto = false; }
      state.rightEverSynced = true;
  };
  window.wpOpenRightPanel = function() {   // Properties on a piece's right-click menu or its selection bar: deliberately open Properties for the current selection
      var sb = document.getElementById('sidebar');
      if (!rightShown(sb)) return;
      sb.classList.remove('collapsed');
      state.rightAuto = true; state.rightAutoKey = window.wpSelKey ? window.wpSelKey() : '';
      state.rightManualKey = undefined; state.rightEverSynced = true;
  };
  // Opened or closed by hand (the panel's X, the tour): that overrides the automatic open and close until the selection changes. Answers
  // whether anything changed
  window.wpRightHand = function(open) {
      var sb = document.getElementById('sidebar');
      if (!rightShown(sb) || sb.classList.contains('collapsed') === !open) return false;
      sb.classList.toggle('collapsed', !open);
      state.rightAuto = false;
      state.rightManualKey = window.wpSelKey ? window.wpSelKey() : '';
      if (state.viewMode === 'data') renderDataMap();
      return true;
  };



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
          profileModal: 'profileCloseBtn',
          shareModal: 'shareCancel',   // 1.6.0 backlog 34: the export share sheet
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
              vEl.textContent = 'Waypoint VTT Alpha ' + ver; vEl.dataset.version = String(ver || '');   // 1.5.6: the release's name (backlog 177)
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
      title.textContent = "What's New" + (versionLabel ? ' — Waypoint VTT Alpha ' + versionLabel : '');
      body.style.textAlign = 'center';   // release notes read centered; Terms/Privacy switch back to left in openLegal
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
    var pc = t.closest('#prepCol'); if (pc && pc.classList && pc.classList.contains('spread')) return true;   // 1.6.2: the Prep column spread wide over the map is pressed as a window is (prep.js)
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
    var pc = typeof document.getElementById === 'function' ? document.getElementById('prepCol') : null;   // 1.6.2: the Prep column spread wide is a window too (barWindow): its head and its body, which lie over the map, since the column's own box is only its docked room
    if (pc && !pc.hidden && pc.classList && pc.classList.contains('spread')) Array.prototype.forEach.call(pc.children || [], function(ch) { if (ch && (ch.id === 'prepBody' || (ch.classList && ch.classList.contains('prep-head')))) bs.push(ch); });
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
    var lay = typeof window !== 'undefined' && window.wpLayout ? window.wpLayout : null;   // 1.6.2 (backlog 224, layout.js): a bar down a side fits as a column, and one across an edge is measured by what it holds
    if (lay && lay.fitSide(_wbTb)) return;
    if (lay) lay.measure(_wbTb, true);
    try { fitRow(); } finally { if (lay) lay.measure(_wbTb, false); }
}
function fitRow() {
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
    portalEnd();   // a new room's portal tile and its line go with it (wpPortalPlace)
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
        toast(this.dataset.shapesize === 'cell' ? 'New shapes arrive one grid cell in size.' : 'New shapes are free-sized. Click for the default, drag for an exact box.');
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
window.wpArmPlacement = armPlacement;   // 1.6.0: a map object takes the map's next click as a shape does (mapobjects.js)
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
    if (P.build) { wpBuildCommit(P, px, py, pw, ph, sx, sy); return; }
    if (P.align) { alignStep(P.align, sx, sy); return; }   // 1.6.2 (backlog 38): a click of Align its grid
    if (P.trim) { trimStep(P.trim, px, py, pw, ph, sx, sy); return; }
    if (P.roomplace) { roomPlaceStep(P.roomplace, px, py, pw, ph); return; }
    if (P.portal) { portalPlaceStep(P.portal, sx, sy); return; }   // 1.6.2 (the owner, 2026-11-14): a new room's portal, in the cell clicked   // 1.6.2 (backlog 45, fold 3): a room's place, drawn from the room
    if (P.cellfit) { if (window.wpCellSize && typeof window.wpCellSize.fitStep === 'function') window.wpCellSize.fitStep(P.cellfit, sx, sy); return; }   // 1.6.2 (backlog 38): a click of Fit grid to picture   // 1.6.2 (backlog 37): a click or a drag of Trim to cells   // the map builder: a built piece lands by its own rules (on the lattice, a hexagon a cell) and Build stays in hand
    var props = Object.assign({}, P.props);
    var dragged = pw > 12 && ph > 12;
    var type = P.type;
    var isHexItem = (type === 'hexagon' || props.shape === 'hexagon');
    var cell = shapeSizeMode() === 'cell' && type !== 'text' && !P.sized;   // 1.6.0: a map object says its own size
    var hexGrid = state.gridType === 'hex';
    var PL = (typeof window !== 'undefined' && window.wpLatticeOf ? window.wpLatticeOf() : null);   // the map's own cell (backlog 38)
    if (cell) { props.w = PL && PL.type === 'hex' ? 2 * PL.s : PL && PL.type === 'square' ? PL.size : hexGrid ? 60 : 50; props.h = PL && PL.type === 'hex' ? PL.h : PL && PL.type === 'square' ? PL.size : hexGrid ? 52 : 50; }
    else if (dragged) { props.w = Math.round(pw); props.h = Math.round(ph); }
    var x = (dragged && !cell) ? px : sx - (props.w || 100) / 2;
    var y = (dragged && !cell) ? py : sy - (props.h || 100) / 2;
    addWbItemAt(type, props, x, y);
    if (window.wpPlaces && typeof window.wpPlaces.placed === 'function') window.wpPlaces.placed(type, state.selWbId);   // 1.6.3: a place pin opens Properties with its Place name ready (places.js)
    if (cell) {
        // Cell-sized shapes always seat into a cell, whether or not Snap is on
        var ci = getActiveMap().whiteboard.find(function(i) { return i.id === state.selWbId; });
        if (ci && hexGrid) {
            var hc = snapToHex(ci.x + ci.w / 2, ci.y + ci.h / 2, 30, 'center');
            ci.x = hc.x - ci.w / 2; ci.y = hc.y - ci.h / 2; save(); render();
        } else if (ci && state.gridType === 'square') {
            var cz = PL && PL.type === 'square' ? PL.size : 50, cx0 = PL && PL.ox || 0, cy0 = PL && PL.oy || 0; ci.x = Math.round((ci.x - cx0) / cz) * cz + cx0; ci.y = Math.round((ci.y - cy0) / cz) * cz + cy0; save(); render();
        }
    } else if (isHexItem && hexGrid && !dragged) snapNewHexItem();
    if (props.furn && !cell && !dragged) furnSeatNew();   // 1.6.2 (backlog 222)
    if (type === 'trigger') toast(isHexItem ? 'Hex trigger added. It fills one grid cell. Write its Event Message in Properties.' : 'Trigger zone added. Write its Event Message in the Properties panel.');
    if (type === 'text') {
        var el = state.wbEls[state.selWbId];
        if (el && el.classList.contains('text')) { try { el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); } catch(_) {} }
    }
};
// [furncheck:seat-start] 1.6.2 (backlog 222): a furnishing placed by a click sits on the lattice where Snap is on, as one dropped from the palette does:
// its corner on a square grid, its middle in a hex cell. With Snap off, or with no grid, it stays where it was put
function furnSeatNew() {
    var am = getActiveMap(), it = am && (am.whiteboard || []).find(function(i) { return i.id === state.selWbId; });
    var GS = it && window.wpSnapOn && window.wpSnapOn() && window.wpLatticeOf ? window.wpLatticeOf(am) : null; if (!GS) return;
    if (GS.type === 'square' && GS.size > 0) { var ox = GS.ox || 0, oy = GS.oy || 0; it.x = Math.round((it.x - ox) / GS.size) * GS.size + ox; it.y = Math.round((it.y - oy) / GS.size) * GS.size + oy; }
    else if (GS.type === 'hex' && typeof snapToHex === 'function') { var hc = snapToHex(it.x + it.w / 2, it.y + it.h / 2, 30, 'center'); it.x = hc.x - it.w / 2; it.y = hc.y - it.h / 2; }
    else return;
    save(); render();
}
// [furncheck:seat-end]
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
    if (e.key === 'Escape' && window.wpPlace && !window.wpPlace.build && (!window.wpEsc || window.wpEsc.free(e))) { var trimEnd = !!window.wpPlace.trim, portalP = window.wpPlace.portal; disarmPlacement(); toast(portalP ? portalSkipSay(portalP) : trimEnd ? 'Trim to cells is put down.' : 'Placement canceled.'); if (trimEnd) render(); }   // a placement that is Build's own is Build's to end (buildKey)
});
// [split:wbbuild.js]
var _wbBuild = wbBuild(), BUILD_MAX = _wbBuild.BUILD_MAX, boxOpenRow = _wbBuild.boxOpenRow, buildAsking = _wbBuild.buildAsking, buildCore = _wbBuild.buildCore, buildDown = _wbBuild.buildDown, buildHere = _wbBuild.buildHere, buildKey = _wbBuild.buildKey, buildMay = _wbBuild.buildMay, buildPolyEnd = _wbBuild.buildPolyEnd, buildStructSync = _wbBuild.buildStructSync, buildWallItem = _wbBuild.buildWallItem, flatRows = _wbBuild.flatRows, genPreviewDraw = _wbBuild.genPreviewDraw, groundPic = _wbBuild.groundPic, pieceRoomMake = _wbBuild.pieceRoomMake, pieceRoomRow = _wbBuild.pieceRoomRow, portalEnd = _wbBuild.portalEnd, portalPlaceStep = _wbBuild.portalPlaceStep, portalSkipSay = _wbBuild.portalSkipSay, roomNamePlaces = _wbBuild.roomNamePlaces, roomNameSync = _wbBuild.roomNameSync, roomPlaceStep = _wbBuild.roomPlaceStep, roomShowRow = _wbBuild.roomShowRow, structDo = _wbBuild.structDo, structLaid = _wbBuild.structLaid, structRow = _wbBuild.structRow, structRowHtml = _wbBuild.structRowHtml, wallsLay = _wbBuild.wallsLay, wallsRow = _wbBuild.wallsRow, wpBuildCommit = _wbBuild.wpBuildCommit;   // [split:glue]
// [split:wbgen.js]
var _wbGen = wbGen(), worldWire = _wbGen.worldWire;   // [split:glue]
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
      var paths = hexTilePaths();   // 1.5.7: the edges of the tile and of its neighbors that reach into it, once each

      var svg = "<svg xmlns='http://www.w3.org/2000/svg' width='90' height='52' viewBox='0 0 90 52'>" +

          "<g stroke='rgba(0,0,0," + alpha + ")' stroke-width='3' fill='none'>" + paths + "</g>" +

          "<g stroke='rgba(255,255,255," + alpha + ")' stroke-width='1.2' fill='none'>" + paths + "</g></svg>";

      return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';

  }



  // The grid lives on an overlay inside the (scaled) whiteboard, so it pans and

  // zooms with the content, always layered above the items.

  // [lookcheck:cellgrid-start]
  // 1.6.2 (backlog 38, a map's own cell size): a map's own cell as fogcore keeps it, null for today's lattice (a 50 px square, a hex of 52 px
  // rows, from the board's 0,0), and the text that says which, so the overlay is drawn again when it changes
  function gridOwnCell(map, type) { var FC = window.wpFogCore; return map && map.meta && FC && typeof FC.cleanMapCell === 'function' ? FC.cleanMapCell(map.meta.cell, type) : null; }
  function gridCellSig(map, type) { var c = gridOwnCell(map, type); return c ? type + ':' + c.size + ':' + (c.ox || 0) + ':' + (c.oy || 0) : ''; }
  // The lines of one tile of a map's own lattice, in board px from the tile's corner: a hex tile is today's 90 by 52 tile scaled by its row
  // over 52 (fogcore keeps a hex's half-width at 30/52 of its row), a square's its four sides
  function gridTileLines(type, size) {
      if (type === 'square') return { w: size, h: size, lines: [[0, 0, size, 0], [0, 0, 0, size], [0, size, size, size], [size, 0, size, size]] };
      var k = size / 52, out = [], re = /M (-?[\d.]+) (-?[\d.]+) L (-?[\d.]+) (-?[\d.]+)/g, m, src = hexTilePaths();
      while ((m = re.exec(src))) out.push([+m[1] * k, +m[2] * k, +m[3] * k, +m[4] * k]);
      return { w: 90 * k, h: 52 * k, lines: out };
  }
  // The overlay of a map with its own cell: one SVG pattern of the tile, in board px and from the lattice's origin, which a browser draws at
  // any size with no drift (a repeated background is tiled at whole pixels); the same dark and light strokes as today's grid. Taken away
  // for today's lattice, which keeps its background
  function gridOwnDraw(overlay, type, cell, alpha) {
      var old = overlay.querySelector(':scope > svg.grid-own');
      if (!cell) { if (old) old.remove(); overlay.dataset.cellSig = ''; return false; }
      var NS = 'http://www.w3.org/2000/svg', t = gridTileLines(type, cell.size), mk = function(n, at) { var e = document.createElementNS(NS, n); Object.keys(at).forEach(function(k) { e.setAttribute(k, String(at[k])); }); return e; };
      var svg = mk('svg', { class: 'grid-own', width: '100%', height: '100%' }), defs = mk('defs', {}), pat = mk('pattern', { id: 'wpGridOwn', patternUnits: 'userSpaceOnUse', x: cell.ox || 0, y: cell.oy || 0, width: t.w, height: t.h });
      [['rgba(0,0,0,' + alpha + ')', 3], ['rgba(255,255,255,' + alpha + ')', 1.2]].forEach(function(st) {
          var g = mk('g', { stroke: st[0], 'stroke-width': st[1], fill: 'none' });
          t.lines.forEach(function(l) { g.appendChild(mk('path', { d: 'M ' + l[0] + ' ' + l[1] + ' L ' + l[2] + ' ' + l[3] })); });
          pat.appendChild(g);
      });
      defs.appendChild(pat); svg.appendChild(defs); svg.appendChild(mk('rect', { width: '100%', height: '100%', fill: 'url(#wpGridOwn)' }));
      svg.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;overflow:visible';
      if (old) old.remove();
      overlay.appendChild(svg);
      overlay.style.backgroundImage = 'none';
      overlay.dataset.cellSig = type + ':' + cell.size + ':' + (cell.ox || 0) + ':' + (cell.oy || 0);
      return true;
  }
  // [lookcheck:cellgrid-end]
  // 1.6.2 (the owner, 2026-11-08: "these tokens arent perfectly aligned on the hexes"): a repeated tile, a background or an SVG pattern alike, is
  // drawn at whole screen pixels, so at a zoom or a display scale that makes a tile no whole number of them the grid drifts a few pixels off the
  // lattice its tokens stand on. The grid is drawn as its own lines instead, over the part of the board in view and half a view around it, and
  // drawn again only when the view leaves what was drawn. Past GRID_LINES_MAX lines (far out) the tile stays, where it is a fraction of a cell
  // [buildcheck:gridlines-start]
  var GRID_LINES_MAX = 30000, _gridDrawn = null, _gridBg = '', _gridRaf = 0;
  // One tile of the lattice: its size, its origin and the edges that, tile by tile, draw every edge once (a hex tile's two hexes have six)
  function gridLattice(type, cell) {
      var ox = cell && cell.ox || 0, oy = cell && cell.oy || 0;
      if (type === 'square') { var s = cell && cell.size > 0 ? cell.size : 50; return { w: s, h: s, ox: ox, oy: oy, edges: [[0, 0, s, 0], [0, 0, 0, s]] }; }
      var k = (cell && cell.size > 0 ? cell.size : 52) / 52;
      return { w: 90 * k, h: 52 * k, ox: ox, oy: oy, edges: [[30, 26, 0, 26], [30, 26, 45, 0], [30, 26, 45, 52], [75, 0, 45, 0], [75, 0, 90, 26], [75, 52, 90, 26]].map(function(e) { return e.map(function(v) { return v * k; }); }) };
  }
  // The path data of the lattice's edges over a box of the board, or null where it would be more than GRID_LINES_MAX of them
  function gridLinesPath(type, cell, box) {
      var L = gridLattice(type, cell), n = function(v) { return Math.round(v * 100) / 100; };
      var i0 = Math.floor((box.x0 - L.ox) / L.w) - 1, i1 = Math.ceil((box.x1 - L.ox) / L.w) + 1, j0 = Math.floor((box.y0 - L.oy) / L.h) - 1, j1 = Math.ceil((box.y1 - L.oy) / L.h) + 1;
      if (!isFinite(i0) || !isFinite(i1) || !isFinite(j0) || !isFinite(j1) || (i1 - i0) * (j1 - j0) * L.edges.length > GRID_LINES_MAX) return null;
      var out = [];
      for (var i = i0; i <= i1; i++) for (var j = j0; j <= j1; j++) {
          var x = L.ox + i * L.w, y = L.oy + j * L.h;
          L.edges.forEach(function(e) { out.push('M' + n(x + e[0]) + ' ' + n(y + e[1]) + 'L' + n(x + e[2]) + ' ' + n(y + e[3])); });
      }
      return out.join('');
  }
  // The part of the board in view, in board px: the screen's corners where the map is turned
  function gridViewBox() {
      var w = document.getElementById('whiteboardWrap'); if (!w || !(w.clientWidth > 0) || !(w.clientHeight > 0)) return null;
      var z = state.zoomLevel || 1, r = window.wpView && typeof window.wpView.screenRect === 'function' ? window.wpView.screenRect() : null;
      if (Array.isArray(r) && r.length) { var xs = r.map(function(p) { return p.x; }), ys = r.map(function(p) { return p.y; }); return { x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs), y0: Math.min.apply(null, ys), y1: Math.max.apply(null, ys) }; }
      return { x0: w.scrollLeft / z, y0: w.scrollTop / z, x1: (w.scrollLeft + w.clientWidth) / z, y1: (w.scrollTop + w.clientHeight) / z };
  }
  // Draws the lines (fresh: the grid was just set, so the tile it set is kept to come back to), or leaves them while the view is inside them
  function gridLinesDraw(overlay, type, cell, alpha, fresh) {
      if (!overlay) return false;
      var old = overlay.querySelector(':scope > svg.grid-lines'), own = overlay.querySelector(':scope > svg.grid-own');
      if (fresh) { _gridDrawn = null; _gridBg = overlay.style.backgroundImage || ''; }
      var tile = function() { if (old) old.remove(); _gridDrawn = null; if (own) own.style.display = ''; if (_gridBg && overlay.style.backgroundImage !== _gridBg) overlay.style.backgroundImage = _gridBg; return false; };
      if (type !== 'square' && type !== 'hex') return tile();
      var need = gridViewBox(); if (!need) return !!old;
      var sig = type + ':' + (cell ? cell.size + ':' + (cell.ox || 0) + ':' + (cell.oy || 0) : '') + ':' + alpha;
      if (old && _gridDrawn && _gridDrawn.sig === sig && need.x0 >= _gridDrawn.x0 && need.y0 >= _gridDrawn.y0 && need.x1 <= _gridDrawn.x1 && need.y1 <= _gridDrawn.y1) return true;
      var mw = (need.x1 - need.x0) / 2, mh = (need.y1 - need.y0) / 2, box = { x0: need.x0 - mw, y0: need.y0 - mh, x1: need.x1 + mw, y1: need.y1 + mh };
      var d = gridLinesPath(type, cell, box); if (d === null) return tile();
      var NS = 'http://www.w3.org/2000/svg', svg = old;
      if (!svg) { svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'grid-lines'); svg.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;overflow:visible'; overlay.appendChild(svg); }
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      [['rgba(0,0,0,' + alpha + ')', 3], ['rgba(255,255,255,' + alpha + ')', type === 'square' ? 1 : 1.2]].forEach(function(st) {
          var p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); p.setAttribute('fill', 'none'); p.setAttribute('stroke', st[0]); p.setAttribute('stroke-width', String(st[1])); svg.appendChild(p);
      });
      if (own) own.style.display = 'none';
      overlay.style.backgroundImage = 'none';
      _gridDrawn = { sig: sig, x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y1 };
      return true;
  }
  function gridLinesSync() {
      _gridRaf = 0;
      var ov = document.getElementById('gridOverlay'); if (!ov || ov.style.display === 'none') return;
      var t = state.gridType; if (t !== 'square' && t !== 'hex') return;
      gridLinesDraw(ov, t, gridOwnCell(getActiveMap(), t), 0.55, false);
  }
  function gridLinesSoon() { if (!_gridRaf) _gridRaf = window.requestAnimationFrame ? requestAnimationFrame(gridLinesSync) : setTimeout(gridLinesSync, 16); }
  window.wpGridSync = gridLinesSoon;
  (function() {
      var w = document.getElementById('whiteboardWrap'); if (w && w.addEventListener) w.addEventListener('scroll', gridLinesSoon, { passive: true });
      if (window.addEventListener) window.addEventListener('resize', gridLinesSoon);
  })();
  // [buildcheck:gridlines-end]
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

      // Viewer's own grid strength (Settings ▸ On my screen); local only, never synced
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
          gridOwnDraw(overlay, type, gridOwnCell(getActiveMap(), type), alpha);   // a map's own cell (backlog 38): its pattern in place of the background
          gridLinesDraw(overlay, type, gridOwnCell(getActiveMap(), type), alpha, true);   // 1.6.2: its own lines over the view, where the tile would drift

      } else if (type === 'hex') {

          overlay.style.backgroundImage = hexBgCss(alpha);

          overlay.style.backgroundSize = '90px 52px';

          overlay.style.backgroundPosition = '0 0';

          overlay.style.display = 'block';
          gridOwnDraw(overlay, type, gridOwnCell(getActiveMap(), type), alpha);
          gridLinesDraw(overlay, type, gridOwnCell(getActiveMap(), type), alpha, true);

      } else {

          type = 'off';

          overlay.style.display = 'none';
          gridOwnDraw(overlay, type, null, alpha);
          gridLinesDraw(overlay, type, null, alpha, true);

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
  // The labels for a box of the board (in its own pixels): [{ x, y, t }], x and y the top middle of a label and t its words. Cell centers are
  // datamap.js snapToHex's own: x = 45q + 15, y = 52r in an even column and 52r + 26 in an odd one. A cell has a label where its column is on
  // the board and its middle below the board's top edge, and the label is listed where its own box (40 wide, from 22 to 12 above the cell's
  // middle) meets the box asked for. null where the box is none, or spans more columns or would hold more labels than max
  function hexLabelCells(x0, y0, x1, y1, max, L) {
      if (L && L.type === 'hex' && (L.h !== 52 || L.ox || L.oy)) {   // 1.6.2, backlog 38: a map's own hex, worked out on today's and moved and scaled to it
          var lk = L.h / 52, lx = L.ox || 0, ly = L.oy || 0, got = hexLabelCells((x0 - lx) / lk, (y0 - ly) / lk, (x1 - lx) / lk, (y1 - ly) / lk, max);
          return got ? got.map(function(o) { return { x: o.x * lk + lx, y: o.y * lk + ly, t: o.t }; }) : got;
      }
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
          ? hexLabelCells(wrap.scrollLeft / z, wrap.scrollTop / z, (wrap.scrollLeft + W) / z, (wrap.scrollTop + H) / z, CELL_LABEL_MAX, window.wpLatticeOf ? window.wpLatticeOf(m) : null) : null;
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

  // 1.6.3 (Fulllion's ruling of 2026-11-17 on the map and fog review, finding 17, "Into the Grid menu"): the Grid menu holds the map's scale,
  // its own cell (Cell size, Offset, Fit grid to picture, Usual size) and a Grid opacity slider beside Label opacity, moved from the measure
  // options and from Settings. Every control keeps its id and its handler (the scale's in this file, the cell's in cellsize.js, the opacity's in
  // settings.js), so only where it stands changed. They are filled from the map on screen as the menu opens, as the measure options were
  function gridMenuSync() {
      if (window.wpCellSize && typeof window.wpCellSize.menuSync === 'function') window.wpCellSize.menuSync();   // the map's own cell, shown only on a map with a grid
      var cfg = mapMeasureConfig(), vEl = document.getElementById('measureCellValue'), uEl = document.getElementById('measureCellUnit');
      if (vEl && document.activeElement !== vEl) vEl.value = cfg.per;
      if (uEl && document.activeElement !== uEl) uEl.value = cfg.unit;
      if (typeof window.wpGridOpacitySync === 'function') window.wpGridOpacitySync();   // this computer's grid opacity, the same figure Settings shows
  }
  if(_el_wbGridBtn) _el_wbGridBtn.addEventListener('click', function() {

      var gmn = document.getElementById('gridMenu');
      gmn.classList.toggle('show');
      if (gmn.classList.contains('show')) { gridMenuSync(); optsFit(gmn, document); }   // taller now that it holds the map's cell: kept clear of the top row, scrolling inside

  });
  window.addEventListener('resize', function() { var gmn = document.getElementById('gridMenu'); if (gmn && gmn.classList.contains('show')) optsFit(gmn, document); });

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
         grid  — cells only (drops seat to the lattice; no magnetism to neighbors)
         items — neighbors only (edges glue/align; drops stay where the magnet left them)
         both  — the old behavior (magnet first, grid takes open-space drops)
       Local preference (wp_snapMode). Size-matching on resize is separate and always on. */
    try { var _sm = localStorage.getItem('wp_snapMode'); state.snapMode = (_sm === 'items' || _sm === 'both') ? _sm : 'grid'; } catch(e) { state.snapMode = 'grid'; }
    var _el_snapMenu = document.getElementById('snapMenu');
    function syncSnapMenu() {
        document.querySelectorAll('.snap-mode-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.mode === state.snapMode); });
        var off = document.getElementById('snapOffBtn');
        if (off) off.textContent = state.snap ? 'Turn snapping off' : 'Turn snapping on';   // 1.6.3 (finding 37): plain words, the power glyph left out
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
        cast[cid] = { id: cid, name: it.charName || 'Character', kind: it.type || 'image', src: it.src || '', furn: (window.wpFurnCore && it.furn ? window.wpFurnCore.cleanFurn(it.furn) : null) || undefined, w: it.w || 60, h: it.h || 52, color: it.color || 'transparent', charStats: it.charStats || '', shape: it.shape || '', savedAt: Date.now() };
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
// backlog 31, fold 2: encounter groups. The selected character tokens saved as a named group (camp.groups, the GM's alone); placing one lays them
// at the center of the view as saved, each NPC that is not ticked Unique on a fresh copy of its sheet, numbered on
function groupsOf(camp) { if (!Array.isArray(camp.groups)) camp.groups = []; return camp.groups; }
function groupSave(items) {
    var camp = getActiveCampaign(), SU = window.wpSetupCore; if (!camp || !SU) return; var toks = items.filter(function(w) { return w && w.isChar === true && !w.waiting; });
    if (!toks.length) { import('./io.js').then(function(m) { m.toast('Select the character tokens to save as a group.'); }); return; }
    if (groupsOf(camp).length >= SU.GROUP_MAX) { import('./io.js').then(function(m) { m.toast('A campaign keeps ' + SU.GROUP_MAX + ' groups at most.'); }); return; }
    showPrompt('Name the encounter group', 'Group ' + (groupsOf(camp).length + 1), function(v) { var nm = SU.cleanName(v); if (!nm) return; var g = SU.takeGroup(toks, nm, Date.now(), SU.newId(groupsOf(camp), 'gr_')); if (!g) return; groupsOf(camp).push(g); if (window.wpStepLog) window.wpStepLog('groups v1', 'save', { pieces: g.pieces.length });
        import('./io.js').then(function(m) { m.save(true); m.toast('Saved the group ' + g.name + ' in the Image Library.'); }); });
}
function groupCopyChar(camp, ch) {   // a fresh copy of an NPC's sheet, numbered on; nothing of who plays it, its links or its debts (1.6.2, backlog 237: the one copy, systemcore sheetCopy)
    var SC = window.wpSystemCore, id = null; if (!SC || !SC.sheetCopy) return null; for (var i = 0; i < 50 && !id; i++) { var t = 'c_' + Math.random().toString(36).slice(2, 12); if (!camp.chars[t]) id = t; } if (!id) return null;
    var nm = window.wpSetupCore.nextName(ch.name, Object.values(camp.chars).map(function(x) { return x && x.name; })), c = null;
    if (ch.template !== true) c = SC.sheetCopy(ch, id, nm, camp.system);
    else if (typeof SC.fromTemplate === 'function') { c = SC.fromTemplate(ch, id, camp.system); if (c) { c.name = nm; c.npc = true; delete c.unique; } }   // the review of backlog 237: a template's piece drops on a sheet made from it, never linked to the template itself
    if (!c) return null;
    camp.chars[id] = c;
    var CK = window.wpCalendarCore, ck = CK && typeof CK.clockCopyChar === 'function' && camp.clock ? CK.clockCopyChar(camp.clock, ch.id, id, false) : null; if (ck) camp.clock = ck;   // and the GM's Rules run switch, where the original's time rules are off
    return c;
}
function groupPlace(gid) {
    var camp = getActiveCampaign(), am = getActiveMap(), SU = window.wpSetupCore; if (!camp || !am || am.type !== 'map' || !SU) return;
    var g = groupsOf(camp).filter(function(x) { return x && x.id === gid; })[0]; if (!g) return; am.whiteboard = am.whiteboard || []; camp.chars = camp.chars || {};
    var c0 = viewCentre(), wMax = Math.max.apply(null, g.pieces.map(function(p) { return p.dx + (p.w || 50); })), hMax = Math.max.apply(null, g.pieces.map(function(p) { return p.dy + (p.h || 50); })), made = 0, copied = 0;
    g.pieces.forEach(function(p) {
        var it = JSON.parse(JSON.stringify(p)); delete it.dx; delete it.dy; it.id = 'wb' + Math.random().toString(36).slice(2, 10); it.x = c0.x - wMax / 2 + p.dx; it.y = c0.y - hMax / 2 + p.dy; delete it.threats; delete it.ownerId;
        var ch = it.charId && camp.chars[it.charId] ? camp.chars[it.charId] : null;
        if (ch && (SU.groupSheetWay(ch) === 'copy' || ch.template === true)) { var nc = groupCopyChar(camp, ch); if (nc) { it.charId = nc.id; it.charName = nc.name; it.name = nc.name; copied++; } else if (ch.template === true) delete it.charId; }   // the review of backlog 237: a template's piece never links to the template
        else if (it.charId && !ch) delete it.charId;
        if (window.wpSeatCell) window.wpSeatCell(it, am); else if (window.wpSeatHex) window.wpSeatHex(it, am);
        am.whiteboard.push(it); made++;
    });
    if (window.wpSheets && window.wpSheets.syncOwners) window.wpSheets.syncOwners(camp);
    if (window.wpStepLog) window.wpStepLog('groups v1', 'place', { pieces: made, copies: copied });
    var lib = document.getElementById('imgLibModal'); if (lib) lib.style.display = 'none';   // the GM sees where it landed; groups show only where the library picks nothing
    import('./io.js').then(function(m) { m.save(); if (window.appRender) window.appRender(); m.toast(g.name + ' placed: ' + made + (made === 1 ? ' token' : ' tokens') + (copied ? ', ' + copied + (copied === 1 ? ' new sheet' : ' new sheets') : '') + '.'); });
}
function groupsLibraryHtml(filter) {
    var camp = getActiveCampaign(); if (!camp || !Array.isArray(camp.groups) || !camp.groups.length) return ''; var q = (filter || '').toLowerCase(), list = camp.groups.filter(function(g) { return g && (!q || String(g.name || '').toLowerCase().indexOf(q) >= 0); });
    if (!list.length) return '';
    return '<div class="img-lib-folder group-head" style="color:var(--gold);"><span>Groups</span><span class="cast-head-note">\u2014 press one to place it at the center of your view; NPCs not ticked Unique get fresh sheets</span></div>'
        + '<div class="group-grid">' + list.map(function(g) { return '<div class="group-cell" data-gid="' + esc(g.id) + '" title="' + esc(g.name) + ' \u2014 press to place it"><span class="group-name">' + esc(g.name) + '</span><small class="group-count">' + g.pieces.length + (g.pieces.length === 1 ? ' token' : ' tokens') + '</small><button class="tool ghost group-del" data-gid="' + esc(g.id) + '" title="Delete this group">&times;</button></div>'; }).join('') + '</div>';
}
// [systemcheck:castplace-start]
function castPlace(cid, x, y, count) {
    var camp = getActiveCampaign(), am = getActiveMap();
    if (!camp || !am || am.type !== 'map') return;
    var c = castOf(camp)[cid]; if (!c) return;
    // 1.6.2 (backlog 237): one copy of a character names its sheet, so the GM is asked first where another token already uses it (sheets.js
    // shareAsk): Share stats, or Its own copy. Escape places nothing
    var SHc = window.wpSheets;
    if (c.charId && Math.max(1, count || 1) === 1 && SHc && typeof SHc.shareAsk === 'function') { SHc.shareAsk(null, c.charId, function(way) { if (way && getActiveMap() === am) castPut(camp, am, c, x, y, 1, way); }); return; }
    castPut(camp, am, c, x, y, count, 'share');
}
function castPut(camp, am, c, x, y, count, way) {
    am.whiteboard = am.whiteboard || [];
    count = Math.max(1, count || 1);
    var cols = Math.ceil(Math.sqrt(count)), gap = 10;
    for (var i = 0; i < count; i++) {
        var col = i % cols, row = Math.floor(i / cols);
        var it = { id: 'wb' + Math.random().toString(36).slice(2, 10), type: c.kind || (c.src ? 'image' : 'circle'), x: x - c.w / 2 + col * (c.w + gap), y: y - c.h / 2 + row * (c.h + gap), w: c.w, h: c.h, z: 10, color: c.color, isChar: true, charName: count > 1 ? c.name + ' ' + (i + 1) : c.name, name: count > 1 ? c.name + ' ' + (i + 1) : c.name, charStats: c.charStats, layer: 'front' };
        if (c.src) it.src = c.src;
        if (c.furn && window.wpFurnCore) { var cf = window.wpFurnCore.cleanFurn(c.furn); if (cf) it.furn = cf; }   // 1.6.2 (backlog 222): a furnishing saved to the cast
        if (c.shape) it.shape = c.shape;
        if (c.charId && count === 1) it.charId = c.charId;   // one copy of a character shares its sheet; several are separate mooks
        if (way === 'copy' && it.charId && window.wpSheets && window.wpSheets.shareTake && !window.wpSheets.shareTake(it, it.charId)) delete it.charId;   // 1.6.2 (backlog 237): or takes its own copy
        if (window.wpSystemCore && window.wpSystemCore.shapeStandIn) window.wpSystemCore.shapeStandIn(it, am);   // grid-shaped tokens: this map's cell shape
        if (window.wpSeatCell) window.wpSeatCell(it, am); else if (window.wpSeatHex) window.wpSeatHex(it, am);
        am.whiteboard.push(it);
    }
    if (c.charId && count === 1 && window.wpSheets && window.wpSheets.syncOwners) window.wpSheets.syncOwners(camp);   // found live, 2026-10-30: a dropped character's token goes to its player by the one rule (systemcore ownedTokenPlan), as a token made any other way does
    import('./io.js').then(function(m) { m.save(true); if (window.appRender) window.appRender(); m.toast(count === 1 ? c.name + ' placed.' : count + ' × ' + c.name + ' placed.'); });
}
// 1.6.3 (the improvement week's review of sheets and rolls, finding 28; Fulllion's pick): Place on this map, from a character's row under
// Characters. The same placing the Campaign Cast makes (castPut, through castPlace's own question), so the token is linked to its sheet with the
// sheet's portrait, a sheet another token already uses asks Share stats or Its own copy (sheets.js shareAsk), and Escape places nothing. It
// stands at the middle of the view, one cell as the map's grid has it (castPut seats it). The GM's, on the play map of a campaign this machine
// may write; never a template, a copy held for its hover, or a sheet that is gone. Answers whether it was placed or is being asked about
function charPlace(charId) {
    var camp = getActiveCampaign(), am = getActiveMap();
    if (!camp || !am || am.type !== 'map' || state.viewMode !== 'visual' || !(window.wpCanPersistLocal && window.wpCanPersistLocal())) return false;
    var ch = camp.chars && typeof charId === 'string' && Object.prototype.hasOwnProperty.call(camp.chars, charId) ? camp.chars[charId] : null; if (!ch || ch.partial || ch.template === true) return false;
    var pic = typeof ch.portrait === 'string' && ch.portrait ? ch.portrait : '';
    var e = { id: '', name: String(ch.name || 'Character').slice(0, 80), src: pic, w: 60, h: 52, color: pic ? 'transparent' : '#8a8f98', kind: pic ? 'image' : 'circle', charId: charId, charStats: '' };
    var ctr = viewCentre(), SHc = window.wpSheets;
    if (SHc && typeof SHc.shareAsk === 'function') { SHc.shareAsk(null, charId, function(way) { if (way && getActiveMap() === am) castPut(camp, am, e, ctr.x, ctr.y, 1, way); }); return true; }
    castPut(camp, am, e, ctr.x, ctr.y, 1, 'share'); return true;
}
// [systemcheck:castplace-end]
window.wpCharPlace = charPlace;   // 1.6.3: the Characters section's Place on this map (charlist.js)
// Cast cells at the top of the image library (new-token flow)
function castLibraryHtml(filter) {
    var camp = getActiveCampaign(); if (!camp) return '';
    var q = (filter || '').toLowerCase();
    var list = Object.values(castOf(camp)).filter(function(c) { return !q || String(c.name || '').toLowerCase().indexOf(q) >= 0; }).sort(function(a, b) { return String(a.name || '').localeCompare(String(b.name || '')); });
    _castOrder = list.map(function(c) { return c.id; });   // the shown order, for Shift-click runs
    if (!list.length) return q ? '' : '<div class="img-lib-folder cast-head" style="color:var(--gold);"><span><i class="wib wi-starf"></i> Campaign Cast</span><span class="cast-head-note">\u2014 empty. Right-click a character token on a play map and choose Save to Campaign Cast; it will show here for quick re-use</span></div>';
    return '<div class="img-lib-folder cast-head" style="color:var(--gold);"><span><i class="wib wi-starf"></i> Campaign Cast</span><span class="cast-head-note">\u2014 click a face for a closer look; Ctrl-click to pick several; its \u00d7 button drops the number in Copies straight onto the map</span></div>'
        + '<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(96px, 1fr)); gap:8px;">' + list.map(function(c) { return '<div class="img-lib-cell cast-cell' + (_castSel[c.id] ? ' picked' : '') + '" data-cid="' + esc(c.id) + '" title="' + esc(c.name) + (c.charStats ? ' — ' + esc(c.charStats) : '') + ' — click for a closer look; Ctrl-click to pick several">' + (picRef(c.src) ? '<img src="' + encodeURI(picRef(c.src)) + '" loading="lazy" alt="">' : '<div style="height:100%; display:flex; align-items:center; justify-content:center; color:var(--gold); font-size:24px;"><i class="wib wi-starf"></i></div>') + '<div class="img-lib-name"><i class="wib wi-starf"></i> ' + esc(c.name) + '</div><button class="tool ghost cast-cell-five" data-cid="' + esc(c.id) + '" title="Drop ' + castBatch() + ' copies">&times;' + castBatch() + '</button></div>'; }).join('') + '</div>'
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
    Array.prototype.forEach.call(document.querySelectorAll('.cm-cast-five, .cast-cell-five, .img-cell-batch'), function(b) { b.textContent = '\u00d7' + n; b.title = 'Drop ' + n + ' cop' + (n === 1 ? 'y' : 'ies') + (b.classList.contains('cm-cast-five') ? ' here' : ' at the center of your view'); });
    Array.prototype.forEach.call(document.querySelectorAll('.cast-batch, .cm-batch'), function(i) { if (i.value !== String(n)) i.value = n; });
    var addBtn = document.getElementById('imgLibPreviewAdd'), pvEl = document.getElementById('imgLibPreview');
    if (addBtn && pvEl && pvEl.style.display !== 'none' && !_imgLibPick) addBtn.textContent = n > 1 ? 'Add \u00d7' + n + ' to map' : 'Add to map';
    return n;
}
function castMenuHtml(camp) {
    var list = Object.values(castOf(camp)).sort(function(a, b) { return String(a.name || '').localeCompare(String(b.name || '')); });
    // One row; the members live in a flyout so the rest of the menu keeps its size whatever the cast holds
    if (!list.length) return '<div class="menu-item cm-session" data-act="cast-manage" title="Right-click a character token and choose Save to Campaign Cast to fill it"><i class="wib wi-starf"></i> Campaign Cast <span style="color:var(--dim); font-size:11px;">— empty</span></div>';
    var html = '<div class="menu-item cm-cast-open" title="Click a member to place a copy here, ×5 for five"><span><i class="wib wi-starf"></i> Campaign Cast</span><span style="color:var(--dim); font-size:11px;">' + list.length + '</span><span style="margin-left:auto; color:var(--dim);">&#8250;</span><div class="cm-sub">';
    html += '<div class="cm-sub-head">' + (list.length > 8 ? '<input type="text" class="cm-filter" placeholder="Filter the cast\u2026">' : '<span style="flex:1; color:var(--dim); font-size:11px;">One copy per click</span>')
          + '<label class="cm-batch-wrap" title="How many copies the \u00d7 button drops (1\u201350)">\u00d7<input type="number" class="cm-batch" min="1" max="50" value="' + castBatch() + '"></label></div>';
    list.forEach(function(c) {
        html += '<div class="menu-item cm-session cm-cast-row" data-act="cast" data-cid="' + esc(c.id) + '" data-name="' + esc((c.name || '').toLowerCase()) + '" style="display:flex; align-items:center; gap:8px;">'
              + (picRef(c.src) ? '<img src="' + esc(picRef(c.src)) + '" alt="" style="width:20px; height:20px; object-fit:cover; border-radius:4px;">' : '<i class="wib wi-starf"></i>')
              + '<span style="flex:1;">' + esc(c.name) + '</span>'
              + '<button class="tool ghost cm-cast-five" data-cid="' + esc(c.id) + '" title="Drop ' + castBatch() + ' copies here" style="padding:1px 7px; font-size:10.5px;">&times;' + castBatch() + '</button></div>';
    });
    html += '<div class="menu-divider"></div><div class="menu-item cm-session" data-act="cast-manage"><i class="wib wi-pen"></i> Manage Cast…</div></div></div>';
    return html;
}
/* ---------- combat: roster panel (GM) and the turn strip (everyone) ---------- */
var combatDraft = null;   // { mapId, fid, rows:[{id,name,tokId,init,src,on,busy}], running }: fid, the fight it edits (fold 2), null for a new one
function fightsHere(mapId) { var n = window.wpNet; return n && typeof n.fightsOn === 'function' ? n.fightsOn(mapId) : []; }   // fold 2: the fights on a map, in the order begun
// [lookcheck:rowname-start]
// The name a fight's row shows: the token's own, which a GM may have chosen for one sheet used many ways. Where another character's token on the map reads
// the same, the character's own name tells them apart, as the table's cards say it
function rowNameOf(w, map, camp) {
    var mine = w.charName || w.name || 'Unnamed', c = camp === undefined && typeof getActiveCampaign === 'function' ? getActiveCampaign() : camp, chs = c && c.chars;
    var ch = chs && typeof w.charId === 'string' && Object.prototype.hasOwnProperty.call(chs, w.charId) ? chs[w.charId] : null, own = ch && typeof ch.name === 'string' ? ch.name.trim() : '';
    if (!own || own === mine || !map || !Array.isArray(map.whiteboard)) return mine;
    return map.whiteboard.some(function(o) { return o && o !== w && o.isChar && o.charId !== w.charId && (o.charName || o.name) === mine; }) ? own : mine;
}
// [lookcheck:rowname-end]
window.wpRowNameOf = rowNameOf;   // the review of backlog 237: net.js names a fight's rows again after a token takes its own sheet
// [lookcheck:onturn-start]
// Fold 2's review: the board's ring on a token whose turn it is, in any fight on that map, while a table is up
function onTurnHere(n, mapId, tokId) {
    if (!n || !n.active || typeof n.fightsOn !== 'function' || typeof tokId !== 'string' || !tokId) return false;
    return n.fightsOn(mapId).some(function(f) { var c = n.combats && n.combats[f], r = c && Array.isArray(c.rows) ? c.rows[c.turn] : null; return !!(r && r.tokId === tokId); });
}
// [lookcheck:onturn-end]
// 1.6.3 (the improvement week's combat review, finding 26): a step of a fight that moves only whose turn it is (net.js combatRefreshTurn) sets the
// ring on the map's drawn pieces by this very test, with no redraw of the board. Every piece drawn (state.wbEls) is judged, as the board's draw
// judges each one
function turnRings() {
    var am = getActiveMap(); if (!am || am.type !== 'map' || !state.wbEls) return false;
    Object.keys(state.wbEls).forEach(function(id) { var el = state.wbEls[id]; if (el && el.classList) el.classList.toggle('wb-turn', onTurnHere(window.wpNet, am.id, id)); });
    return true;
}
window.wpTurnRings = turnRings;
function combatRowsFor(mapId, opts) {
    var camp = getActiveCampaign(), map = camp && camp.items[mapId]; if (!map) return [];
    var n = window.wpNet, fidR = opts && typeof opts.fid === 'string' ? opts.fid : null, running = fidR && n.combats && Object.prototype.hasOwnProperty.call(n.combats, fidR) ? n.combats[fidR] : null;
    var elsewhere = Object.create(null); fightsHere(mapId).forEach(function(f) { if (f !== fidR) (n.combats[f].rows || []).forEach(function(r) { if (r && typeof r.tokId === 'string') elsewhere[r.tokId] = 1; }); });   // fold 2: a token is in one fight at a time
    var byTok = {}; (running ? running.rows : []).forEach(function(r) { if (r.tokId) byTok[r.tokId] = r; });
    // live target pairs on this map: whoever is targeting (their own token) and whoever they target
    var pair = {}, picked = {}; ((opts && opts.pre) || []).forEach(function(id) { picked[id] = 1; });   // what is picked on the map is ticked and says nothing of a target (found live, 2026-10-30: every picked token read targeted)
    Object.keys((n && n.targets) || {}).forEach(function(pid) {
        var t = n.targets[pid]; if (!t || t.mapId !== mapId) return;
        pair[t.id] = 'targeted';
        var aimer = pid.indexOf('tk:') === 0 ? pid.slice(3) : '', mine = (map.whiteboard || []).find(function(w) { return w.isChar && !w.hidden && (aimer ? w.id === aimer : w.ownerId === pid); });   // tk: one of the GM's characters aiming (158, Target as; the live test, 2026-10-30: it came unticked)
        if (mine) pair[mine.id] = pair[mine.id] || 'targeting';
    });
    // 1.6.3 (the combat review, findings 7 and 15; Fulllion, 2026-11-20: a hidden token joins a fight and acts like any other): every character token is listed, a hidden
    // one too, tagged hidden. A running fight's hidden row stays ticked as it was, so an unrelated roster edit never takes it out of the order and ends its holds; a hidden
    // token not in the fight comes unticked unless it was picked on the map. A player reads a row they never saw in this fight as Hidden (the host makes each player's copy of the order), as for a token
    // hidden once the fight began. Finding 0: a row holding its turn carries held through the edit, and the host keeps what its hold names with it (net.js fightReachKept)
    var rows = (map.whiteboard || []).filter(function(w) { return w.isChar; }).map(function(w) {
        var was = byTok[w.id], busy = !was && elsewhere[w.id] === 1;
        var on = !busy && (!!was || !!pair[w.id] || picked[w.id] === 1);   // only a running combat's rows and the tokens in a target pair start ticked; never a token in another fight (fold 2)
        var o = { id: was ? was.id : 'r' + w.id, name: typeof rowNameOf === 'function' ? rowNameOf(w, map) : w.charName || w.name || 'Unnamed', tokId: w.id, init: was ? was.init : 0, rolled: !!(was && was.rolled === 1), tb: was && Array.isArray(was.tb) ? was.tb.slice() : undefined, src: w.src || null, on: on, busy: busy, party: !!w.ownerId, targeted: pair[w.id] || '', charId: w.charId || null };
        if (w.hidden) o.hidden = true;
        if (was && was.held === 1) o.held = true;
        return o;
    });
    // custom rows of a running combat (no token) stay, a hold with them
    (running ? running.rows : []).forEach(function(r) { if (!r.tokId) { var oC = { id: r.id, name: r.name, tokId: null, init: r.init, rolled: r.rolled === 1, tb: Array.isArray(r.tb) ? r.tb.slice() : undefined, src: null, on: true, custom: true }; if (r.held === 1) oC.held = true; rows.push(oC); } });
    if (running) {   // keep the running order first, newcomers after
        var order = {}; running.rows.forEach(function(r, i) { order[r.id] = i; });
        rows.sort(function(a, b) { var x = order[a.id] !== undefined ? order[a.id] : 999 + rows.indexOf(a), y = order[b.id] !== undefined ? order[b.id] : 999 + rows.indexOf(b); return x - y; });
    } else rows.sort(function(a, b) { return (b.on || b.targeted ? 1 : 0) - (a.on || a.targeted ? 1 : 0) || (b.party ? 1 : 0) - (a.party ? 1 : 0) || a.name.localeCompare(b.name); });
    return rows;
}
function combatSortByInit(rows) {   // high to low, ties keep their place (initiative O1: the core's one rule, shared with the host's re-sort)
    var S = window.wpSystemCore; if (S && S.orderByInit) return S.orderByInit(rows, window.wpSheets && window.wpSheets.initTieNow ? window.wpSheets.initTieNow() : null);   // initiative O2: the system's tie steps
    return rows.map(function(r, i) { return { r: r, i: i }; }).sort(function(a, b) { return (b.r.init - a.r.init) || (a.i - b.i); }).map(function(x) { return x.r; });
}
// [netcheck:rostershape-start]
// 1.6.3 (the combat review, finding 32; Fulllion, 2026-11-20: the roster fits the turn shape): which of the system's turn shapes the roster serves, read from the
// GM's own copy of the system. 'deck' (the order is drawn, so a typed number is thrown away), 'clock' (the number is a count, and a row at 0 or less never acts),
// 'side' (the order stands grouped by side), else '' (an initiative, higher first). deck carries the deck's own name, for the roster's help line
function rosterShape(camp) {
    var sy = camp && camp.system, cm = sy && sy.combat && typeof sy.combat === 'object' ? sy.combat : null, ir = cm && cm.initiative && typeof cm.initiative === 'object' ? cm.initiative : null;
    if (!ir) return { kind: '' };
    if (ir.deck && typeof ir.deck === 'object') { var dk = (Array.isArray(sy.decks) ? sy.decks : []).filter(function(d) { return !!d && d.key === ir.deck.key; })[0]; return { kind: 'deck', deck: dk && typeof dk.label === 'string' && dk.label.trim() ? dk.label.trim().slice(0, 60) : 'its deck' }; }
    if (ir.clock && typeof ir.clock === 'object') return { kind: 'clock' };
    if (typeof ir.side === 'string' && ir.side) return { kind: 'side' };
    return { kind: '' };
}
// Findings 20 and 0: where play stands for one row of a running fight, from the host's own record of it (live, net.combats[fid] on the GM's machine): now, whose turn
// it is; held, holding its turn, with the words its hold names where it names some; acted, it has had its turn this round (Next is chosen's mark, else the turns the
// fight reached in this very round, fightReachTurn's th, whose keys are the row's id with what tells its later turns apart). A row of a fight that is not running, none
function rosterRowState(live, rid) {
    var o = { now: false, held: false, holdText: '', acted: false }; if (!live || !Array.isArray(live.rows) || typeof rid !== 'string') return o;
    var row = live.rows.filter(function(r) { return !!r && r.id === rid; })[0]; if (!row) return o;
    o.now = live.rows[live.turn] === row;
    o.held = !o.now && row.held === 1; if (o.held && row.holdFor && typeof row.holdFor.text === 'string') o.holdText = row.holdFor.text.slice(0, 120);
    var th = live.th && typeof live.th === 'object' && live.rh === live.round ? live.th : null;
    o.acted = !o.now && !o.held && (row.dn === 1 || !!(th && Object.keys(th).some(function(k) { return th[k] === 1 && (k === rid || k.indexOf(rid + '#') === 0); })));
    return o;
}
// 1.6.3 (the review of the combat roster): where a row begins on a counting clock, which is what says whether it ever acts. A row's count runs down to 0 as it acts and
// goes back to where it began at the next cycle (the host's ck0, live.ck0 on the GM's machine), so the count it stands at in the middle of a cycle says nothing of that.
// The higher of where it began and the count given wins, as clockStart keeps it: a count the GM types above 0 is where the row then begins. live: the fight as the host
// holds it, or none for a fight not yet running; id: the row's id; now: its count as given. Asked by the roster, Update and the turn strip
function clockBegin(live, id, now) {
    var b = live && live.ck0 && typeof live.ck0 === 'object' && typeof id === 'string' && Object.prototype.hasOwnProperty.call(live.ck0, id) ? Number(live.ck0[id]) : NaN, n = Number(now);
    return Math.max(isFinite(b) ? b : -Infinity, isFinite(n) ? n : -Infinity);
}
// Finding 13: the words for rows whose count on a counting clock is 0 or less, which never get a turn: names, three at most and how many more
function clockNeverWords(names) {
    if (!Array.isArray(names) || !names.length) return '';
    var shown = names.slice(0, 3).join(', ') + (names.length > 3 ? ' and ' + (names.length - 3) + ' more' : '');
    return shown + (names.length === 1 ? ' has' : ' have') + ' a count of 0 or less, so on the counting clock ' + (names.length === 1 ? 'it never acts' : 'they never act') + '. Give ' + (names.length === 1 ? 'it' : 'each') + ' a count above 0 in the roster.';
}
// [netcheck:rostershape-end]
function renderCombatModal() {
    var m = document.getElementById('combatModal'), list = document.getElementById('combatRows'); if (!m || !list || !combatDraft) return;
    var camp = getActiveCampaign(), map = camp && camp.items[combatDraft.mapId];
    var mapNm = map && map.meta && map.meta.title || combatDraft.mapId, fidsM = fightsHere(combatDraft.mapId), atM = combatDraft.fid ? fidsM.indexOf(combatDraft.fid) : -1;
    var nW = window.wpNet, live = combatDraft.running && combatDraft.fid && nW && nW.combats && Object.prototype.hasOwnProperty.call(nW.combats, combatDraft.fid) ? nW.combats[combatDraft.fid] : null;   // 1.6.3 (finding 20): the fight this roster edits, as the host holds it
    document.getElementById('combatMapName').textContent = mapNm + (atM >= 0 && fidsM.length > 1 ? ', fight ' + (atM + 1) + ' of ' + fidsM.length : (!combatDraft.fid && fidsM.length ? ', another fight' : '')) + (live && typeof live.round === 'number' ? ', round ' + live.round : '');   // fold 2: which fight on the map; 1.6.3: and the round it stands in
    var running = combatDraft.running, findHere = findWho(window.wpNet, !!window.wpStream), amHere = getActiveMap();   // backlog 26: a name finds its token on this screen
    document.getElementById('combatStartBtn').textContent = running ? 'Update combat' : 'Start combat';   // 1.6.3 (the combat review, finding 33): sentence case, as its other words
    // 1.6.3 (finding 32): the roster's words and boxes follow the turn shape. Under a deck the numbers, each row's roll and Roll all are put away (never removed), since the
    // order is drawn; under a counting clock the box is a count and a row at 0 or less is marked, since it never acts; under sides a line says the order stands by side
    var shp = typeof rosterShape === 'function' ? rosterShape(camp) : { kind: '' }, deckS = shp.kind === 'deck', clockS = shp.kind === 'clock';
    var helpE = document.getElementById('combatHelp');
    if (helpE) helpE.textContent = deckS ? 'Tick who is in the fight. The order is drawn from ' + shp.deck + ' at each round’s start, so no number is asked.' : clockS ? 'Tick who is in the fight and give each a count. Higher acts first. A row at 0 or less never acts.' : 'Tick who is in the fight and give each an initiative. Higher goes first.' + (shp.kind === 'side' ? ' The order is then grouped by side, and each side goes together.' : '');
    var rallB = document.getElementById('combatRollAllBtn'); if (rallB) rallB.style.display = !deckS && window.wpSheets && window.wpSheets.hasInitRoll() ? '' : 'none';   // initiative O1: only with an initiative roll in the system; 1.6.3: and never under a deck
    var nameN = {}, nameAt = {}; combatDraft.rows.forEach(function(r) { nameN['n' + r.name] = (nameN['n' + r.name] || 0) + 1; });   // 1.6.0: rows of one name told apart by a number
    var fa = document.activeElement, fr = fa && list.contains(fa) && fa.closest ? fa.closest('.combat-row') : null, keepR = fr ? fr.dataset.rid : '', keepC = fr ? ['combat-on', 'combat-init', 'combat-roll', 'combat-up', 'combat-down'].filter(function(c) { return fa.classList.contains(c); })[0] : '';   // 1.6.0: a redraw keeps the keyboard's place in the list
    list.innerHTML = combatDraft.rows.map(function(r, i) {
        var dupT = nameN['n' + r.name] > 1 ? ' <span class="combat-tag" title="Rows of one name, numbered down the list">' + (nameAt['n' + r.name] = (nameAt['n' + r.name] || 0) + 1) + '</span>' : '';
        var stR = typeof rosterRowState === 'function' ? rosterRowState(live, String(r.id)) : { now: false, held: false, acted: false, holdText: '' }, neverR = clockS && r.on && !r.busy && !((typeof clockBegin === 'function' ? clockBegin(live, String(r.id), r.init) : Number(r.init)) > 0);   // 1.6.3 (findings 20 and 13; the review: judged by where the row begins, so a row that acted down to 0 mid-cycle is not marked)
        var stateT = (stR.now ? ' <span class="combat-tag combat-now" title="Whose turn it is now">now</span>' : '') + (stR.held || (!live && r.held) ? ' <span class="combat-tag" title="' + esc(stR.holdText ? 'Holding their turn until ' + stR.holdText : 'Holding their turn. The hold stays when you update the roster') + '">holding</span>' : '') + (stR.acted ? ' <span class="combat-tag" title="Has had its turn this round">acted</span>' : '')
            + (r.hidden ? ' <span class="combat-tag" title="Hidden from players. It takes its turns as any other. A player who saw it in this fight keeps its name, and the others read Hidden">hidden</span>' : '') + (neverR ? ' <span class="combat-tag combat-never" title="On the counting clock a row at 0 or less never acts. Give it a count above 0">never acts</span>' : '');
        return '<div class="combat-row' + (r.on ? '' : ' off') + (stR.now ? ' now' : '') + (neverR ? ' never' : '') + '" draggable="true" data-i="' + i + '" data-rid="' + esc(String(r.id)) + '">'
            + '<span class="combat-grip" title="Drag to reorder">&#8942;</span>'
            + '<input type="checkbox" class="combat-on"' + (r.on ? ' checked' : '') + (r.busy ? ' disabled title="In another fight on this map: a token is in one fight at a time"' : ' title="In the fight"') + '>'
            + (r.src ? '<img class="combat-face" src="' + esc(resolveImg(r.src)) + '" alt="">' : '<span class="combat-face combat-face-empty" title="' + (r.custom ? 'A row you added' : 'A token with no picture of its own') + '">' + (r.custom ? '<i class="wib wi-spark"></i>' : '<i class="wib wi-starf"></i>') + '</span>')
            + '<span class="combat-name">' + findName(r.name, r.tokId, !!findOf(combatDraft.mapId, r.tokId, findHere, amHere, state.viewMode)) + dupT + (r.party ? ' <span class="combat-tag">party</span>' : '') + (r.targeted ? ' <span class="combat-tag" style="color:var(--gold); border-color:var(--gold);">' + r.targeted + '</span>' : '') + (r.custom ? ' <span class="combat-tag">custom</span>' : '') + (r.busy ? ' <span class="combat-tag">in another fight on ' + esc(mapNm) + '</span>' : '') + stateT + '</span>'
            + (r.charId && window.wpSheets && window.wpSheets.hasInitRoll() ? '<button class="tool ghost combat-roll"' + (deckS ? ' style="display:none"' : '') + ' title="Roll initiative from the character sheet. A player&rsquo;s roll goes to the table. An NPC&rsquo;s goes to you alone unless NPC initiative rolls in Settings says Everyone, and so does one that reads a GM-only value. Players see the order" aria-label="Roll initiative">' + (window.wpDieIcons && typeof window.wpDieIcons.dieSvg === 'function' ? window.wpDieIcons.dieSvg('d6') : '<i class="wib wi-die"></i>') + '</button>' : '')
            + '<input type="number" class="combat-init field" value="' + (r.init || 0) + '"' + (deckS ? ' style="display:none"' : '') + (clockS ? ' title="Count. Higher acts first. A row at 0 or less never acts" aria-label="Count"' : ' title="Initiative — higher goes first"') + '>'
            + '<span class="ui-seg combat-moves"><button class="tool ghost combat-up" title="Move up">&#9650;</button><button class="tool ghost combat-down" title="Move down">&#9660;</button></span>'
            + (r.custom ? '<button class="tool ghost danger combat-del" title="Remove this row">&times;</button>' : '')
            + '</div>';
    }).join('') || '<div style="color:var(--dim); padding:8px;">No character tokens on this map. Add a custom row below, or place tokens first.</div>';
    // 1.6.3 (finding 35): a picture whose file is gone shows the plain face a token with no picture has, never the browser's broken picture. A listener, never an attribute
    if (typeof list.querySelectorAll === 'function') Array.prototype.forEach.call(list.querySelectorAll('img.combat-face'), function(im) { im.addEventListener('error', function() { var sp = document.createElement('span'); sp.className = 'combat-face combat-face-empty'; sp.title = 'Its picture file is missing'; sp.innerHTML = '<i class="wib wi-starf"></i>'; if (im.parentNode) im.parentNode.replaceChild(sp, im); }, { once: true }); });
    m.style.display = 'flex';
    if (keepC) { var backR = [].slice.call(list.querySelectorAll('.combat-row')).filter(function(x) { return x.dataset.rid === keepR; })[0], backE = backR && backR.querySelector('.' + keepC); if (backE) backE.focus({ preventScroll: true }); }
}
function openCombatModal(mapId, opts) {   // opts.fid: that fight's roster; opts.fresh: a new fight beside those on the map (fold 2); else the strip's fight there, or a new one
    var n = window.wpNet; if (!(n && (n.active ? n.role === 'host' : (typeof n.soloHost === 'function' && n.soloHost())))) { toast('Combat runs on your own campaign, or at a table you host.'); return; }   // 1.6.2 (the owner: "Fight without hosting")
    opts = opts || {};
    var fid = opts.fresh === true ? null : (typeof opts.fid === 'string' && fightsHere(mapId).indexOf(opts.fid) >= 0 ? opts.fid : stripFightId(mapId));
    combatDraft = { mapId: mapId, fid: fid, rows: combatRowsFor(mapId, Object.assign({}, opts, { fid: fid })), running: !!fid };
    renderCombatModal();
}
window.wpOpenCombat = openCombatModal;
(function wireCombatModal() {
    var m = document.getElementById('combatModal'), list = document.getElementById('combatRows'); if (!m || !list) return;
    if (typeof findLitWire === 'function') findLitWire(list);
    function rowOf(e) { var r = e.target.closest && e.target.closest('.combat-row'); return r ? +r.dataset.i : -1; }
    var hold = typeof pressHold === 'function' ? pressHold(list, window) : null, sortLater = function() { if (!combatDraft || !combatDraft.sortDue) return; combatDraft.sortDue = false; combatDraft.rows = combatSortByInit(combatDraft.rows); renderCombatModal(); };   // 1.6.0, found by hand: numbers typed down the list move no row until the list is left, so a row never moves under the next press and no box loses its focus
    list.addEventListener('change', function(e) {
        var i = rowOf(e); if (i < 0) return;
        if (e.target.classList.contains('combat-on')) { combatDraft.rows[i].on = e.target.checked && !combatDraft.rows[i].busy; renderCombatModal(); }   // fold 2: never a token in another fight
        if (e.target.classList.contains('combat-init')) { combatDraft.rows[i].init = Number(e.target.value) || 0; combatDraft.rows[i].rolled = true; delete combatDraft.rows[i].tb; combatDraft.sortDue = true; }   // initiative O1: a number given is its number (a player's roll no longer changes it)
    });
    list.addEventListener('focusout', function(e) { if (!combatDraft || !combatDraft.sortDue || (e.relatedTarget && list.contains(e.relatedTarget))) return; if (hold && hold.busy()) hold.then(sortLater); else sortLater(); });
    list.addEventListener('keydown', function(e) { e.stopPropagation(); });
    m.addEventListener('pointerdown', function() { rosterUnpeek(m); });   // backlog 26: a press on the roster while it is faded for a find brings it back at once
    list.addEventListener('click', function(e) {
        var i = rowOf(e); if (i < 0) return;
        if (combatDraft.sortDue && e.target.closest('.combat-up, .combat-down')) { var mvR = combatDraft.rows[i]; combatDraft.sortDue = false; combatDraft.rows = combatSortByInit(combatDraft.rows); i = combatDraft.rows.indexOf(mvR); }   // an arrow moves a row of the order the numbers give
        var rows = combatDraft.rows;
        if (e.target.closest('.combat-up') && i > 0) { rows.splice(i - 1, 0, rows.splice(i, 1)[0]); renderCombatModal(); }
        else if (e.target.closest('.combat-down') && i < rows.length - 1) { rows.splice(i + 1, 0, rows.splice(i, 1)[0]); renderCombatModal(); }
        else if (e.target.closest('.combat-roll')) { var rr = window.wpSheets && rows[i].charId ? window.wpSheets.rollInit(rows[i].charId, { priv: combatRollPriv(combatDraft.mapId, rows[i].tokId), tok: rows[i].tokId }) : null; if (rr && rr.error) toast(rr.error); else if (rr && typeof rr.value === 'number') { rows[i].init = rr.value; rows[i].rolled = true; delete rows[i].tb; combatDraft.rows = combatSortByInit(rows); renderCombatModal(); } }
        else if (e.target.closest('.combat-del')) { rows.splice(i, 1); renderCombatModal(); }
        else if (e.target.closest('.combat-find')) { if (combatFind(combatDraft.mapId, String(e.target.closest('.combat-find').dataset.tok || ''))) rosterPeek(m, FIND_MS + 200); }   // backlog 26: the token found on this screen, the roster faded while its ring shows
    });
    var dragI = -1;
    list.addEventListener('dragstart', function(e) { dragI = rowOf(e); if (dragI < 0) { e.preventDefault(); return; } e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(dragI)); } catch (err) {} });
    list.addEventListener('dragover', function(e) { if (dragI < 0) return; e.preventDefault(); var r = e.target.closest && e.target.closest('.combat-row'); list.querySelectorAll('.combat-row').forEach(function(x) { x.classList.toggle('drop-before', x === r); }); });
    list.addEventListener('drop', function(e) {
        e.preventDefault(); var j = rowOf(e); if (dragI < 0 || j < 0 || j === dragI) { dragI = -1; renderCombatModal(); return; }
        var rows = combatDraft.rows, mv = rows.splice(dragI, 1)[0]; rows.splice(j, 0, mv); dragI = -1; combatDraft.sortDue = false; renderCombatModal();
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
            var rr = window.wpSheets.rollInit(r.charId, { priv: combatRollPriv(draft.mapId, r.tokId), tok: r.tokId }); if (rr && rr.held) { held.push(r.name || 'A character'); heldW = heldW || rr.error || ''; continue; } if (rr && rr.error) { toast(rr.error); break; }   // held (1.5.4): what its initiative roll needs is not met, it is passed over
            if (rr && typeof rr.value === 'number') { r.init = rr.value; r.rolled = true; delete r.tb; n++; }
        }
        draft.rows = combatSortByInit(draft.rows);
        if (held.length) toast(held.join(', ') + (held.length === 1 ? ' was' : ' were') + ' passed over. ' + heldW);
        return n;
    }
    // [systemcheck:rollall-end]
    var tickAllBtn = document.getElementById('combatTickAllBtn');   // 1.6.2 (the owner: "compact rows"): every row that may join, ticked at once
    if (tickAllBtn) tickAllBtn.addEventListener('click', function() { if (!combatDraft) return; combatDraft.rows.forEach(function(r) { if (r && !r.busy && !r.hidden) r.on = true; }); renderCombatModal(); });   // 1.6.3 (the review of the combat roster): never a hidden token, which is ticked one at a time, so one press does not pull hidden ambushers into every player's order as Hidden rows
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
        if (combatDraft.sortDue) { combatDraft.sortDue = false; combatDraft.rows = combatSortByInit(combatDraft.rows); }
        var was = combatDraft.fid && n.combats && Object.prototype.hasOwnProperty.call(n.combats, combatDraft.fid) ? n.combats[combatDraft.fid] : null;   // fold 2: the fight this roster edits, by its id
        // 1.6.3 (finding 0; the review of the combat roster): a hold is taken from the fight as it stands at Update, never from the roster as it opened: the held row may
        // have acted from its hold, or the round ended and the hold was lost, while the roster was open, and the hold must not come back. Only a fight not yet running
        // reads the draft's own flag
        var heldNow = function(r) { if (!was) return !!r.held; var lr = (was.rows || []).filter(function(x) { return !!x && x.id === r.id; })[0]; return !!lr && lr.held === 1 && was.rows[was.turn] !== lr; };
        var rows = combatDraft.rows.filter(function(r) { return r.on && !r.busy; }).map(function(r) { var o = { id: r.id, name: r.name, tokId: r.tokId, init: r.init, src: r.src }; if (r.rolled) o.rolled = 1; if (Array.isArray(r.tb)) o.tb = r.tb; if (heldNow(r)) o.held = 1; return o; });   // initiative O1: whether a row has its number; 1.6.3 (finding 0): and a hold it keeps
        if (!rows.length) { toast('Tick at least one combatant.'); return; }
        var neverS = typeof rosterShape === 'function' && rosterShape(getActiveCampaign()).kind === 'clock' ? rows.filter(function(r) { return !((typeof clockBegin === 'function' ? clockBegin(was, r.id, r.init) : Number(r.init)) > 0); }).map(function(r) { return r.name || 'Someone'; }) : [];   // 1.6.3 (finding 13): said, never refused; the review: judged by where a row begins
        var turn = 0, round = 1;
        if (was) { round = was.round; var curId = (was.rows[was.turn] || {}).id; var at = rows.findIndex(function(r) { return r.id === curId; }); turn = at >= 0 ? at : 0; }
        var midS = combatDraft.mapId, fidS = n.fightSet(was ? combatDraft.fid : null, { mapId: midS, round: round, turn: turn, rows: rows });
        if (!was && typeof fidS === 'string' && typeof stripShow === 'function') { stripShow(midS, fidS); if (typeof renderCombatStrip === 'function') renderCombatStrip(); }   // fold 2: a fight started here is the one this screen's strip shows
        if (neverS.length && typeof fidS === 'string' && typeof clockNeverWords === 'function') toast(clockNeverWords(neverS));
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
    if (n.role === 'host') { var st = n.turnMove && Object.prototype.hasOwnProperty.call(n.turnMove, fid) ? n.turnMove[fid] : null; if (!st || typeof st.allow !== 'number' || st.rowId !== cur.id) return null; var oM = { m: st.moved, a: st.allow }; if (typeof st.run === 'number' && st.ran !== true && st.allow > st.walk) oM.w = st.walk; return oM; }
    if (!c.mv || typeof c.mv.m !== 'number' || typeof c.mv.a !== 'number') return null; var oC = { m: c.mv.m, a: c.mv.a }; if (typeof c.mv.w === 'number') oC.w = c.mv.w; return oC;
}
// [sinkcheck:holdask-start]
// 1.6.0 A hold names what sets it off (combat.turn.holdNames): the strip's Hold asks for a short line and, if the player likes, a roll of the sheet's system by its id.
// A box of elements and text nodes, away from the strip, which is drawn again whenever a turn moves. The host cleans what comes of it (systemcore cleanHoldFor)
function holdRolls(sys) { return (sys && Array.isArray(sys.rolls) ? sys.rolls : []).filter(function(r) { return !!r && typeof r.id === 'string' && r.init !== true; }).map(function(r) { return { id: r.id, label: String(r.label || 'Roll').split('{')[0].trim().slice(0, 60) || 'Roll' }; }); }
function holdClose() { var b = document.getElementById('holdAsk'); if (b && b.parentNode) b.parentNode.removeChild(b); }
function holdAsk(anchor, sys, done) {
    holdClose(); var box = document.createElement('div'); box.id = 'holdAsk'; box.className = 'hold-ask';
    var cap = document.createElement('label'); cap.className = 'hold-ask-cap'; cap.textContent = 'What sets it off?'; box.appendChild(cap);
    var inp = document.createElement('input'); inp.type = 'text'; inp.className = 'field'; inp.maxLength = 120; inp.placeholder = 'Say what you wait for'; cap.appendChild(inp);
    var sel = document.createElement('select'), rolls = holdRolls(sys); sel.className = 'field'; sel.title = 'What the character does when it comes. Set off then sends this roll as a card';
    var mk = function(v, t) { var o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); }; mk('', 'No roll named'); rolls.forEach(function(r) { mk(r.id, r.label); }); if (rolls.length) box.appendChild(sel);
    var go = function() { var t = inp.value.trim(); if (!t) { inp.focus(); return; } var hf = { text: t }; if (sel.value) hf.roll = sel.value; holdClose(); done(hf); };
    var btn = function(t, f) { var b = document.createElement('button'); b.type = 'button'; b.className = 'tool ghost'; b.textContent = t; b.addEventListener('click', f); box.appendChild(b); }; btn('Hold', go); btn('Cancel', holdClose);
    box.addEventListener('keydown', function(e) { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); go(); } else if (e.key === 'Escape') { e.preventDefault(); holdClose(); } });
    document.body.appendChild(box);
    // 1.6.3 (the combat review's batch "strip", finding 11): the box stands by what was pressed. Pressed from the strip's menu the anchor is the strip's own Hold button, which the
    // compact strip puts away, so its rectangle has no size and the box went to the window's top left corner, over the top row. An anchor with no size gives way to the strip's
    // last button, the one the menu opened under, then to the strip itself, and with neither the box stands in the middle of the window
    var sized = function(e) { var r = e && e.getBoundingClientRect ? e.getBoundingClientRect() : null; return r && (r.width > 0 || r.height > 0) ? r : null; }, stS = document.getElementById('combatStrip');
    var ra = sized(anchor) || sized(stS && stS.querySelector ? stS.querySelector('.combat-strip-morebtn') : null) || sized(stS);
    if (ra) { box.style.left = Math.max(8, Math.min(window.innerWidth - box.offsetWidth - 8, ra.left)) + 'px'; box.style.top = Math.max(8, Math.min(window.innerHeight - box.offsetHeight - 8, ra.bottom + 6)) + 'px'; }
    else { box.style.left = Math.max(8, Math.round((window.innerWidth - box.offsetWidth) / 2)) + 'px'; box.style.top = Math.max(8, Math.round((window.innerHeight - box.offsetHeight) / 2)) + 'px'; }
    inp.focus(); return box;
}
function stripHeldNamed(r, host, nameH) {   // a held row under holdNames: its words for the GM and its holder, in esc; the GM's Set off
    var said = host ? (r.holdFor && r.holdFor.text) || '' : typeof r.hf === 'string' ? r.hf : '';
    return '<span class="combat-strip-held" data-tip="' + esc(said ? 'Holding for: ' + said : 'Holding their turn until something sets it off') + '">held ' + nameH + (said ? ': ' + esc(said) : '') + '</span>' + (host ? '<button class="combat-strip-btn" data-act="setoff" data-row="' + esc(String(r.id)) + '" title="Set off: this hold\u2019s action comes now, before the turn goes on">Set off</button>' : '');
}
// [sinkcheck:holdask-end]
function stripMoveHtml(n, fid, c, map) {
    var mv = turnMoveOf(n, fid, c, null); if (!mv || !n.cellsText) return '';
    var over = mv.m > mv.a + 0.05, r = Math.round(mv.m * 10) / 10, fig = function(v) { return String(Math.round(v * 10) / 10); };
    // 1.6.3 (the combat review's batch "strip", finding 31; Fulllion's pick of 2026-11-20): the walk is the move, and the run an aside, as the turn's notice says them:
    // "Moved 2 of 5 hexes (5 yd), 10 if you run" while a run is on offer (w, how far it goes before it spends the action), and "No move this turn" for a token that
    // has none and has not moved (a Down character)
    var words = mv.a <= 0 && mv.m <= 0.05 ? 'No move this turn' : 'Moved ' + fig(r) + ' of ' + n.cellsText(typeof mv.w === 'number' ? mv.w : mv.a, map) + (typeof mv.w === 'number' ? ', ' + fig(mv.a) + ' if you run' : '');
    return '<span class="combat-strip-move' + (over ? ' over' : '') + '" data-tip="How far the token on turn has moved, of its move this turn' + (typeof mv.w === 'number' ? '. Past ' + esc(n.cellsText(mv.w, map)) + ' it spends the action' : '') + '">' + esc(words) + '</span>';
}
// [lookcheck:stripacts-start]
// 1.6.0: what the character on turn has left of each action, as the strip says it. net.js actsNow says whether there is anything to say: a player's character, where actions are counted
function stripActsHtml(n, c, map) {
    var cur = c && c.rows ? c.rows[c.turn] : null, tok = cur && cur.tokId && map && Array.isArray(map.whiteboard) ? map.whiteboard.find(function(w) { return w && w.id === cur.tokId; }) : null;
    var al = tok && typeof tok.charId === 'string' && n && typeof n.actsNow === 'function' ? n.actsNow(tok.charId) : null; if (!al || !al.left) return '';
    var cp = getActiveCampaign(), tn = cp && cp.system && cp.system.combat ? cp.system.combat.turn : null, acts = tn && Array.isArray(tn.acts) ? tn.acts : [], out = true;
    var bits = acts.filter(function(a) { return a && typeof al.left[a.key] === 'number'; }).map(function(a) { var k = al.left[a.key]; if (k > 0) out = false; return esc(a.label || 'Action') + ': ' + (k > 0 ? esc(String(k)) + ' left' : 'none left'); });
    return bits.length ? '<span class="combat-strip-acts' + (out ? ' out' : '') + '" data-tip="What the character on turn has left of each action this turn">' + bits.join(', ') + '</span>' : '';
}
// [lookcheck:stripacts-end]
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
    var strip = document.getElementById('combatStrip'); if (!strip) return;
    var n = window.wpNet, am = getActiveMap();
    if (n && !n.active && !n.solo && typeof n.soloHost === 'function' && n.soloOk && n.soloOk()) { var cmS = getActiveCampaign(); if (cmS && cmS.fights && typeof cmS.fights === 'object') n.soloHost(); }   // 1.6.2: a fight this campaign kept, back with no table open
    var fidS = n && (n.active || n.solo) && am && am.type === 'map' && state.viewMode === 'visual' ? stripFightId(am.id) : null, c = fidS ? n.combats[fidS] : null;
    if (!c) { strip.innerHTML = ''; strip.wpDrawn = ''; strip.style.display = 'none'; if (typeof stripMenu === 'function') stripMenu(strip, false); if (typeof stripInBar === 'function') stripInBar(); if (typeof window !== 'undefined' && window.wpPills) window.wpPills.sync(); return; }   // backlog 219: the bar lets the fight go, and the Round pill comes back
    var idsS = fightsHere(am.id), atS = idsS.indexOf(fidS);
    // 1.6.3 (the combat review's batch "strip", finding 23): who acts next is the host's to work out by the turn shape (net.js fightNextAt), the GM's strip asking it
    // and a player's reading the place it was sent (nx, -1 where it cannot be known: a counting clock, a round whose order is made again). An older host sends none,
    // and the row after the one on turn is the guess it always was. A row redacted for this player is never named next
    var nxAt = n.role === 'host' ? (typeof n.fightNextAt === 'function' ? n.fightNextAt(fidS) : undefined) : c.nx;
    var cur = c.rows[c.turn] || {}, nxt = typeof nxAt === 'number' ? (nxAt >= 0 && c.rows.length > 1 ? c.rows[nxAt] || null : null) : c.rows[(c.turn + 1) % c.rows.length] || {};
    var host = n.role === 'host', mine = !host && n.myTurnTok ? n.myTurnTok() : null;   // turn-based combat T2: the player on turn ends it here
    if (mine && mine.fid && mine.fid !== fidS) mine = null;   // fold 2: on the strip of the fight they are on turn in
    // initiative O5 (backlog 34): Next is chosen. Up next is the next in the standing order who has not gone this round, and Pick next lists those
    // who may go next instead, for the GM at any time and for a player at their own turn; a pick is judged by the host
    var campC = getActiveCampaign(), sysC = campC && campC.system, irC = sysC && sysC.combat && typeof sysC.combat === 'object' && sysC.combat.initiative && typeof sysC.combat.initiative === 'object' ? sysC.combat.initiative : null;
    var SCc = window.wpSystemCore, chS = !!(irC && irC.chosen === true && SCc && typeof SCc.chosenNext === 'function' && typeof SCc.chosenPicks === 'function'), nxC = chS ? SCc.chosenNext(c.rows, c.turn) : null;
    if (nxC) nxt = c.rows[nxC.at] || {};
    var pickH = '';
    if (chS && (host || mine)) {
        var pkOpen = strip.wpPickOpen === fidS, pkL = SCc.chosenPicks(c.rows, c.turn);
        pickH = '<button class="combat-strip-btn' + (pkOpen ? ' is-open' : '') + '" data-act="pickopen" title="' + (pkL.round ? 'Everyone has gone this round: pick who opens round ' + (c.round + 1) : 'Pick who goes next from those who have not gone this round') + (host ? '' : '. It ends your turn') + '">Pick next</button>';
        if (pkOpen) pickH += '<span class="combat-strip-picks">' + pkL.at.map(function(i) { var pr = c.rows[i] || {}, prN = esc(String(pr.name || 'Someone')); return '<button class="combat-strip-btn combat-strip-pick' + (nxC && nxC.at === i ? ' is-next' : '') + '" data-act="pick" data-row="' + esc(String(pr.id || '')) + '" title="' + prN + (pkL.round ? ' opens round ' + (c.round + 1) : ' goes next') + '">' + prN + '</button>'; }).join('') + '</span>';
    }
    strip.style.display = 'flex';
    var nameRoom = c.rows.reduce(function(m, r) { return Math.max(m, String((r && r.name) || '').length); }, 0);
    if (strip.style.setProperty) strip.style.setProperty('--strip-name', Math.min(nameRoom, 28) + 'ch');   // room for the longest name of the fight, so the arrow after the names stays under the pointer
    var who = findWho(n, !!window.wpStream), nameOf = function(r) { return findName(r.name || '', r.tokId, !!findOf(am.id, r.tokId, who, am, state.viewMode)); };   // backlog 26: a name that finds its token on this screen is a button
    var myTokIds = {}; if (!host && am && Array.isArray(am.whiteboard)) am.whiteboard.forEach(function(w) { if (w && w.isChar && w.ownerId && w.ownerId === n.myId && typeof w.id === 'string') myTokIds[w.id] = 1; });   // initiative O3: whose held rows a player may act from
    var campH = typeof getActiveCampaign === 'function' ? getActiveCampaign() : null, holdStay = !!(campH && campH.system && campH.system.combat && campH.system.combat.turn && campH.system.combat.turn.holdAct === 'stay'), holdNm = !!(campH && campH.system && campH.system.combat && campH.system.combat.turn && campH.system.combat.turn.holdNames === true), holdNext = !!(campH && campH.system && campH.system.combat && campH.system.combat.turn && campH.system.combat.turn.hold === 'next');   // 1.6.0: a system that keeps its order, and one whose holds name what sets them off
    // 1.6.3 (the combat review, finding 13): on a counting clock a row at 0 or less never gets a turn, so the GM's strip names it, in the strip's menu
    var neverH = host && irC && irC.clock && typeof irC.clock === 'object' ? c.rows.filter(function(r) { return !!r && !((typeof clockBegin === 'function' ? clockBegin(c, r.id, r.init) : Number(r.init)) > 0); }).map(function(r) { return '<span class="combat-strip-held combat-strip-never" data-tip="On the counting clock a row at 0 or less never acts. Give it a count in the roster">never acts ' + nameOf(r) + '</span>'; }).join('') : '';
    var heldH = c.rows.map(function(r, i) { if (r && r.sf === 1) return '<span class="combat-strip-held" data-tip="Their hold was set off: they act before the turn goes on">acts now ' + nameOf(r) + '</span>'; if (holdNm && typeof stripHeldNamed === 'function') return r && r.held === 1 && i !== c.turn ? stripHeldNamed(r, host, nameOf(r)) : ''; return r && r.held === 1 && i !== c.turn ? '<span class="combat-strip-held" data-tip="' + (holdStay ? 'Holding their turn: they may act now, and Done ends the hold' : 'Holding their turn: Act puts them right after whoever is acting') + '">held ' + nameOf(r) + '</span>' + (host || (typeof r.tokId === 'string' && myTokIds[r.tokId] === 1) ? '<button class="combat-strip-btn" data-act="act" data-row="' + esc(r.id) + '" title="' + (holdStay ? 'Done: the hold ends and the order stays as it is' : 'Act now: right after whoever is acting') + '">' + (holdStay ? 'Done' : 'Act') + '</button>' : '') : ''; }).join('');
    // drawn again only when it changed (found live, 2026-10-17): a redraw between a press and its click took the button pressed off the page, so
    // the press did nothing. What was written last is kept on the strip, since a hover moves each title into data-tip and the page's markup changes
    var html = (idsS.length > 1 ? '<button class="combat-strip-btn combat-strip-switch" data-act="switch" title="' + idsS.length + ' fights run on this map: show the next one. This changes nothing for anyone else">' + (atS + 1) + ' of ' + idsS.length + '</button>' : '')
        + '<span class="combat-strip-round" title="Round"><i class="wib wi-fight"></i> R' + c.round + '</span>'
        + (c.side === 'pc' || c.side === 'rest' ? '<span class="combat-strip-side" title="Side initiative: this round&rsquo;s sides roll put this side first">' + (c.side === 'pc' ? 'players first' : 'the rest first') + '</span>' : '')
        + (host ? '<button class="combat-strip-btn" data-act="prev" title="Previous turn"><i class="wib wi-nextturn wib-mirror"></i></button>' : '')   // 1.6.3 (finding 28; Fulllion's pick of 2026-11-20): Next's own drawing turned the other way, so the two arrows pair up
        + '<span class="combat-strip-cur" data-tip="Whose turn it is">' + (cur.src ? '<img src="' + esc(resolveImg(cur.src)) + '" alt="">' : '') + nameOf(cur) + '</span>'
        + (typeof stripMoveHtml === 'function' ? stripMoveHtml(n, fidS, c, am) : '')   // 1.5.7: the turn's move, asked through typeof for the suites that slice the strip alone
        + (typeof stripActsHtml === 'function' ? stripActsHtml(n, c, am) : '')   // 1.6.0: its actions, the same way
        + (nxt && (nxt !== cur || typeof nxAt === 'number') && nxt.hid !== 1 ? '<span class="combat-strip-next" data-tip="' + (chS ? 'Up next: the next in the order who has not gone this round' : 'Up next') + '">next ' + nameOf(nxt) + (nxC && nxC.round ? ', opening round ' + (c.round + 1) : '') + '</span>' : '')   // 1.6.2: a fight of one names nobody next
        + (mine ? '<button class="combat-strip-btn combat-strip-endturn" data-act="endturn" title="End your turn: play moves on to the next in the order' + (chS ? ' who has not gone. Pick next chooses another' : '') + '"><i class="wib wi-endturn"></i> End turn</button>' : '')
        + pickH + neverH
        + (chS ? '' : (host || mine ? '<button class="combat-strip-btn" data-act="hold" title="' + (holdNm ? 'Hold this turn and say what sets it off: play moves on, and it lasts to this character&rsquo;s next turn' : 'Hold this turn: play moves on. ' + (holdStay ? 'They act while held, and Done ends the hold.' : 'Act later puts them right after whoever is acting.') + (holdNext ? ' The hold lasts to their next turn.' : ' A hold not used by the round&rsquo;s end is lost.')) + '">Hold</button>' : '') + heldH)
        + (host ? '<button class="combat-strip-btn" data-act="next" title="Next turn"><i class="wib wi-nextturn"></i></button><button class="combat-strip-btn" data-act="edit" title="Combat roster"><i class="wib wi-pen"></i></button><button class="combat-strip-btn danger" data-act="end" title="End combat">&times;</button>' : '');
    // backlog 219 (the owner, 2026-11-10, by prompt, from the sheet docs/sheets/fight-in-bar-sheet.html: "A. A segment of the row"): the fight is a part of the trackers
    // bar's own row (trackers.js draws it there) and keeps the round, the arrows and whose turn it is; the rest is a menu under its last button, this screen's alone.
    // A player on their own turn keeps their move, actions and End turn in sight, and the stream window shows who is next and has no menu
    var moreOn = !(typeof window !== 'undefined' && window.wpStream) && (/combat-strip-(side|held|picks|next)|data-act="(pickopen|hold|edit|end|act)"/.test(html) || (!mine && /combat-strip-(move|acts)/.test(html))), moreOpen = moreOn && strip.wpMoreOpen === fidS;
    if (moreOn) html += '<button class="combat-strip-btn combat-strip-morebtn" data-act="more" aria-haspopup="true" aria-expanded="' + (moreOpen ? 'true' : 'false') + '" title="The rest of the fight: who is next' + (host ? ', what is left of the turn, Hold, the roster and End combat' : mine ? ' and Hold' : '') + '">&#8943;</button>';
    if (strip.classList) strip.classList[mine ? 'add' : 'remove']('is-mine');
    if (strip.wpDrawn !== html) { strip.innerHTML = html; strip.wpDrawn = html; }
    if (typeof stripInBar === 'function') stripInBar();
    if (typeof stripMenu === 'function') stripMenu(strip, moreOpen);
    if (typeof window !== 'undefined' && window.wpPills) window.wpPills.sync();   // backlog 219: the Round pill hides while the strip shows
}
// [lookcheck:fightmenu-start]
// Backlog 219 (the owner, 2026-11-10, by prompt: "A. A segment of the row"): the bar is trackers.js's, which puts the fight in its row; told at every drawing of the strip
function stripInBar() { var t = typeof window !== 'undefined' ? window.wpTrackers : null; if (t && typeof t.draw === 'function') t.draw(); }
// The fight's menu under its last button: what the bar's row leaves out, in the strip's own order. A word is a line of text; a button is a row that presses the strip's own
// button, so every press goes through the strip's one listener. The bar hides what overflows it, so the menu stands in the page, placed under the button
var STRIP_KEEP = ['combat-strip-round', 'combat-strip-switch', 'combat-strip-cur', 'combat-strip-endturn', 'combat-strip-morebtn'];
function stripKept(el, mine) {
    var k = el && el.classList; if (!k) return true;
    if (STRIP_KEEP.some(function(c) { return k.contains(c); })) return true;
    if (el.dataset && (el.dataset.act === 'prev' || el.dataset.act === 'next')) return true;
    return !!mine && (k.contains('combat-strip-move') || k.contains('combat-strip-acts'));
}
function stripMenuRows(strip) {
    var out = [], mine = !!(strip.classList && strip.classList.contains('is-mine')), held = '';
    var word = function(el) { var t = String(el.textContent || '').replace(/\s+/g, ' ').trim(); if (el.classList.contains('combat-strip-next')) t = t.replace(/^next /, 'Next: '); return t; };
    var row = function(b) {
        var act = b.dataset ? b.dataset.act : '', t = String(b.textContent || '').trim();
        if (act === 'edit') return { b: b, text: 'Combat roster…' };
        if (act === 'end') return { b: b, text: 'End combat', red: true };
        if (act === 'act') return { b: b, text: (t || 'Act') + (held ? ': ' + held : '') };
        return { b: b, text: t };
    };
    Array.prototype.forEach.call(strip.children || [], function(el) {
        if (stripKept(el, mine)) return;
        if (el.classList.contains('combat-strip-held')) { held = word(el).replace(/^held |^acts now /, ''); out.push({ text: word(el) }); return; }
        if (el.classList.contains('combat-strip-picks')) { Array.prototype.forEach.call(el.querySelectorAll('.combat-strip-btn'), function(b) { out.push(row(b)); }); return; }
        if (el.tagName === 'BUTTON') { out.push(row(el)); return; }
        var w = word(el); if (w) out.push({ text: w });
    });
    return out;
}
function stripMenu(strip, open) {
    var m = document.getElementById('fightMenu');
    if (!open) { if (m) m.hidden = true; return; }
    if (!m) {
        m = document.createElement('div'); m.id = 'fightMenu'; m.className = 'fight-menu'; m.setAttribute('role', 'menu'); m.hidden = true; document.body.appendChild(m);
        m.addEventListener('pointerdown', function(e) { e.stopPropagation(); });
        m.addEventListener('click', function(e) {
            var r = e.target.closest && e.target.closest('.fight-menu-row'); if (!r || !r.wpPress) return;
            e.stopPropagation(); var sp = document.getElementById('combatStrip');
            if (sp && r.wpPress.dataset.act !== 'pickopen') sp.wpMoreOpen = null;   // a row that acts puts the menu away; Pick next opens its list in it
            r.wpPress.click();
            if (sp && sp.wpMoreOpen == null) renderCombatStrip();
        });
    }
    // 1.6.3 (the combat review's batch "strip", finding 11, found live): the strip is drawn again often (every redraw of the board asks it), and the menu's rows were made
    // anew each time, so a row the pointer went down on could be gone by the time it came up, and the press (Hold, the roster, End combat) did nothing. The rows are made
    // again only when what they say, or the strip they press, has changed
    var rowsM = stripMenuRows(strip), sigM = String(strip.wpDrawn || '') + '\n' + JSON.stringify(rowsM.map(function(r) { return [r.text, !!r.b, !!r.red]; }));
    if (m.wpSig === sigM && m.firstChild) {
        // 1.6.3 (the release click test): the strip is often drawn anew with the very same words (its last button says whether the menu is open, so
        // every opening and closing writes the strip again), and its buttons are then new elements. A kept row still pointed at the button it was made
        // for, which was no longer in the strip, so End combat, Hold and the roster did nothing. The rows stay, so a press under way is not lost, and
        // each is pointed again at the strip's live button, in the same order
        var liveM = rowsM.filter(function(r) { return !!r.b; }), keptM = Array.prototype.filter.call(m.children || [], function(c) { return /(^| )fight-menu-row( |$)/.test(String(c.className || '')); });
        if (keptM.length === liveM.length) { keptM.forEach(function(c, i) { c.wpPress = liveM[i].b; }); rowsM = []; } else { m.wpSig = sigM; m.textContent = ''; }
    } else { m.wpSig = sigM; m.textContent = ''; }
    var heads = true;
    rowsM.forEach(function(r) {
        if (!r.b) { var h = document.createElement('div'); h.className = 'fight-menu-word'; h.textContent = r.text; m.appendChild(h); return; }
        if (heads) { heads = false; if (m.firstChild) m.appendChild(document.createElement('hr')); }
        if (r.red && m.lastChild && m.lastChild.tagName !== 'HR') m.appendChild(document.createElement('hr'));
        var b = document.createElement('button'); b.type = 'button'; b.className = 'fight-menu-row' + (r.red ? ' red' : ''); b.setAttribute('role', 'menuitem'); b.textContent = r.text; b.wpPress = r.b; m.appendChild(b);
    });
    m.hidden = false;
    var mb = strip.querySelector ? strip.querySelector('.combat-strip-morebtn') : null, br = mb ? mb.getBoundingClientRect() : null;
    if (br) { var w = m.offsetWidth || 180, L = Math.max(8, Math.min(br.left, window.innerWidth - w - 8)); m.style.left = Math.round(L) + 'px'; m.style.top = Math.round(br.bottom + 6) + 'px'; }
}
function stripMenuOff() { var sp = document.getElementById('combatStrip'); if (sp && sp.wpMoreOpen) { sp.wpMoreOpen = null; renderCombatStrip(); } }
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') document.addEventListener('pointerdown', function(e) { var m = document.getElementById('fightMenu'); if (!m || m.hidden) return; var t = e.target; if (m.contains(t) || (t.closest && t.closest('.combat-strip-morebtn'))) return; stripMenuOff(); }, true);
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') document.addEventListener('keydown', function(e) { var m = document.getElementById('fightMenu'); if (e.key !== 'Escape' || !m || m.hidden) return; e.preventDefault(); e.stopPropagation(); stripMenuOff(); var sp = document.getElementById('combatStrip'), mb = sp && sp.querySelector('.combat-strip-morebtn'); if (mb) mb.focus(); });
// [lookcheck:fightmenu-end]
window.wpRenderCombatStrip = renderCombatStrip;
// 1.6.0 (the owner, by prompt: "Light it on hover"): the pointer or the keyboard's focus on a name lights its token on this screen, so that tokens of one name can be told apart. Nothing is stored or sent
var _litEl = null;
function findLit(tokId) {
    if (_litEl) { _litEl.classList.remove('wb-find-lit'); _litEl = null; }
    if (typeof tokId !== 'string' || !tokId) return;
    var all = document.querySelectorAll('.wb-item'); for (var i = 0; i < all.length; i++) if (all[i].dataset.id === tokId) { _litEl = all[i]; _litEl.classList.add('wb-find-lit'); return; }
}
function findLitWire(box) {
    var lit = function(e) { var b = e.target.closest && e.target.closest('.combat-find'); findLit(b ? String(b.dataset.tok || '') : ''); };
    box.addEventListener('pointerover', lit); box.addEventListener('focusin', lit);
    box.addEventListener('pointerleave', function() { findLit(''); }); box.addEventListener('focusout', function() { findLit(''); });
}
(function wireCombatStrip() {
    var strip = document.getElementById('combatStrip'); if (!strip) return;
    if (typeof findLitWire === 'function') findLitWire(strip);
    strip.addEventListener('pointerdown', function(e) { e.stopPropagation(); });
    strip.addEventListener('click', function(e) {
        var fb = e.target.closest && e.target.closest('.combat-find');
        if (fb) { e.stopPropagation(); var amF = getActiveMap(); if (amF) combatFind(amF.id, String(fb.dataset.tok || '')); return; }   // backlog 26: a name finds its token on this screen
        var b = e.target.closest && e.target.closest('.combat-strip-btn'); if (!b) return;
        e.stopPropagation();
        var n = window.wpNet, am = getActiveMap();
        if (b.dataset.act === 'more') { var fidM = am ? stripFightId(am.id) : null; strip.wpMoreOpen = strip.wpMoreOpen === fidM ? null : fidM; renderCombatStrip(); return; }   // backlog 219: the rest of the strip, on this screen alone
        if (b.dataset.act === 'switch') { if (am && stripSwitch(am.id)) renderCombatStrip(); return; }   // fold 2: the next fight on this map, on this screen alone
        if (b.dataset.act === 'pickopen') { var fidO = am ? stripFightId(am.id) : null; strip.wpPickOpen = strip.wpPickOpen === fidO ? null : fidO; renderCombatStrip(); return; }   // initiative O5: the list of those who may go next, on this screen alone
        if (b.dataset.act === 'pick') {   // initiative O5: the GM's pick goes at once (the host judges it); a player's ends their own turn with it
            var rowP = String(b.dataset.row || ''), fidP = am ? stripFightId(am.id) : null; strip.wpPickOpen = null;
            if (n && n.role === 'host') { if (fidP && n.fightStep(fidP, 1, undefined, rowP) === false) toast('They have had their turn this round.'); }
            else { var rp = n && n.turnEnd ? n.turnEnd(rowP) : null; if (rp && rp.error) toast(rp.error); }
            renderCombatStrip(); return;
        }
        if (b.dataset.act === 'hold' && n && typeof holdAsk === 'function') {   // 1.6.0: a named hold asks first
            var cpH = getActiveCampaign(), syH = cpH && cpH.system, tnH = syH && syH.combat && syH.combat.turn;
            if (tnH && tnH.holdNames === true) { var fidN = am ? stripFightId(am.id) : null; holdAsk(b, syH, function(hf) { if (n.role === 'host') { if (fidN && !n.fightHold(fidN, undefined, hf)) toast('That hold could not be made.'); } else { var rH = n.turnHold ? n.turnHold(hf) : null; if (rH && rH.error) toast(rH.error); } }); return; }
        }
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
        else if (b.dataset.act === 'setoff') n.fightSetOff(fidB, String(b.dataset.row || ''));   // 1.6.0: a named hold's action, before the turn goes on
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
    var stL = typeof nameCss === 'function' ? nameCss(tokId) : ''; if (stL) t = '<span class="plook-name" style="' + esc(stL) + '">' + t + '</span>';   // 1.6.2, backlog 35: its character's look
    if (ok !== true || typeof tokId !== 'string' || !tokId) return t;
    var tip = esc('Find ' + (String(name || '') || 'this token') + ' on the map');
    return '<button type="button" class="combat-find" data-tok="' + esc(tokId) + '" data-tip="' + tip + '" aria-label="' + tip + '">' + t + '</button>';
}
// 1.6.2, backlog 35: the css of the look of the character a token of the map on screen stands for, or '' (wpPlook.css, which cleans it)
function nameCss(tokId) {
    var P = typeof window !== 'undefined' ? window.wpPlook : null; if (!P || typeof P.css !== 'function' || typeof tokId !== 'string' || !tokId) return '';
    var am = typeof getActiveMap === 'function' ? getActiveMap() : null, w = am && Array.isArray(am.whiteboard) ? am.whiteboard.filter(function(x) { return x && x.id === tokId; })[0] : null;
    return w ? P.css(P.ofTok(w)) : '';
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
        return '<div class="cast-row" data-cid="' + esc(c.id) + '">' + (picRef(c.src) ? '<img src="' + esc(picRef(c.src)) + '" alt="">' : '<div class="cast-thumb-empty"><i class="wib wi-starf"></i></div>')
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
    // Where the menu lives. The page puts #contextMenu inside #whiteboardWrap, the play map's box, and the Data Map hides that box (display: none),
    // so on the Data Map a room's right-click menu was built and never seen, and its Properties row (the only way to a room's settings since
    // the edge tab went, the rail merge of 1.6.2) could not be reached. While the box is hidden the menu moves to the page itself; it is
    // position: fixed, so nothing about where it stands changes. Back on the play map it goes home into the box, as the page wrote it.
    // Found live on 2026-11-14 in the review of that merge. No document in a suite's stand-in: nothing moves there.
    var home = typeof document !== 'undefined' && document && typeof document.getElementById === 'function' ? document.getElementById('whiteboardWrap') : null;
    if (home && document.body && typeof getComputedStyle === 'function') {
        var hidden = getComputedStyle(home).display === 'none';
        if (hidden && cMenu.parentNode === home) document.body.appendChild(cMenu);
        else if (!hidden && cMenu.parentNode === document.body) home.appendChild(cMenu);
    }
    cMenu.style.position = 'fixed';
    cMenu.classList.remove('compact', 'tall'); cMenu.style.maxHeight = '';
    if (cMenu.offsetHeight > room) cMenu.classList.add('compact');
    if (cMenu.offsetHeight > room) { cMenu.classList.add('tall'); cMenu.style.maxHeight = room + 'px'; }
    if (!cMenu._wheelKept) { cMenu._wheelKept = true; cMenu.addEventListener('wheel', function(we) { if (cMenu.classList.contains('tall')) we.stopPropagation(); }, { passive: true }); }   // scrolling a tall menu never zooms the board under it
    if (e) cMenu._wpAt = { x: e.clientX, y: e.clientY };   // the live test, 2026-10-30: fitted again it goes back to the pointer: a tall menu pushed up the screen left a short list far from its token
    var at = cMenu._wpAt, x = e ? e.clientX : at ? at.x : parseFloat(cMenu.style.left) || 0, y = e ? e.clientY : at ? at.y : parseFloat(cMenu.style.top) || 0;
    cMenu.style.left = x + 'px'; cMenu.style.top = y + 'px';
    // keep it on screen
    var r = cMenu.getBoundingClientRect();
    if (r.right > window.innerWidth - 6) cMenu.style.left = Math.max(6, x - (r.right - window.innerWidth + 6)) + 'px';
    if (r.bottom > window.innerHeight - 6) cMenu.style.top = Math.max(6, y - (r.bottom - window.innerHeight + 6)) + 'px';
    if (e) cMenu.scrollTop = 0;   // a menu that comes up starts at its top: the browser hands one element's scroll on from the last menu it held, which put Sheet… above the menu's top
}
// [systemcheck:placemenu-end]
// The table menu: Campaign Cast, Players ("Bring here"), Session actions. Returns the html and a
// wire() for its items, so it can stand alone (empty space) or hang under an item menu.
function tableMenuParts(e, role) {
    var n = window.wpNet, camp = getActiveCampaign(), html = '';
    var wrap = document.getElementById('whiteboardWrap'), b = wrap ? wrap.getBoundingClientRect() : { left: 0, top: 0 }, z = state.zoomLevel || 1;
    var pt = wrap ? { x: wbX(e.clientX, e.clientY, b, wrap), y: wbY(e.clientX, e.clientY, b, wrap) } : { x: e.clientX / z, y: e.clientY / z };
    var players = camp && camp.players ? Object.keys(camp.players).map(function(id) { return { id: id, name: (n && typeof n.recName === 'function' ? n.recName(camp.players[id], id) : camp.players[id].name || id) }; }).sort(function(a, c) { return a.name.localeCompare(c.name); }).slice(0, 12) : [];
    function head(label) { return '<div class="menu-item" style="color:var(--dim); font-size:10.5px; letter-spacing:.06em; text-transform:uppercase; cursor:default;">' + label + '</div>'; }
    function bringItems() { return players.map(function(p) { return '<div class="menu-item cm-session" data-act="bring" data-pid="' + esc(p.id) + '"><i class="wib wi-bring"></i> Bring ' + esc(p.name) + ' here</div>'; }).join(''); }
    if (role === 'client') {
        html += head('Session') + '<div class="menu-item cm-session" data-act="leave" style="color:var(--danger)">Leave session</div>';
    } else {
        var nxW = window.wpPageShelf && typeof window.wpPageShelf.nextScene === 'function' ? window.wpPageShelf.nextScene() : null, nextScene = nxW && camp && camp.items[nxW.id] ? camp.items[nxW.id] : (camp ? Object.values(camp.items).find(function(it) { return it.type === 'planner' && it.meta && it.meta.status === 'next'; }) : null);   // 1.6.2 (backlog 166 d): at tonight's scene
        if (nextScene) html += '<div class="menu-item cm-session" data-act="scene" data-id="' + esc(nextScene.id) + '"' + (nxW && nxW.at && nxW.id === nextScene.id && /^[A-Za-z0-9_-]{1,64}$/.test(nxW.at) ? ' data-at="' + esc(nxW.at) + '"' : '') + ' title="The planner marked Next. A click opens it over the map. Ctrl+click opens a new window. Alt+click opens the planner itself.">&#9654; Next scene: ' + esc(nextScene.meta.title || 'planner') + '</div><div class="menu-divider"></div>';
        var scnPg = window.wpPageShelf && typeof window.wpPageShelf.scenePage === 'function' ? window.wpPageShelf.scenePage() : null;   // 1.6.0 (pageshelf.js): the map's scene page, opened by the one rule as Next scene is
        if (scnPg) html += '<div class="menu-item cm-session" data-act="scene" data-id="' + esc(scnPg.id) + '" title="This map\'s scene page. Shift+P opens it too. A click opens it over the map. Ctrl+click opens a new window. Alt+click opens the page itself."><i class="wib wi-mask"></i> Scene page: ' + esc(scnPg.title) + '</div>';
        var amPin = getActiveMap(), isPinned = !!(camp && amPin && Array.isArray(camp.pinnedMaps) && camp.pinnedMaps.indexOf(amPin.id) >= 0);
        if (amPin && amPin.type === 'map' && window.wpSetups) html += '<div class="menu-item cm-session" data-act="setups" title="Named saves of this map\u2019s tokens, fog and lights, restored from a list">Set-ups\u2026</div>';   // backlog 31
        var scSys = camp && camp.system && Array.isArray(camp.system.scenes) ? camp.system.scenes : [], scNow = amPin && amPin.meta && typeof amPin.meta.scene === 'string' ? amPin.meta.scene : '';   // 1.6.2: the scene's channel on this map
        var dkSys = camp && camp.system && Array.isArray(camp.system.dark) ? camp.system.dark : [], dkNow = amPin && amPin.meta && typeof amPin.meta.dark === 'string' ? amPin.meta.dark : '';   // 1.6.2: the map's darkness step
        if (amPin && amPin.type === 'map' && dkSys.length && window.wpCanPersistLocal && window.wpCanPersistLocal()) { html += head('Darkness'); html += '<div class="menu-item cm-session" data-act="dkst" data-k="lit" title="No darkness on this map">' + (!dkNow ? '<i class="wib wi-check"></i> ' : '') + 'Lit</div>'; dkSys.forEach(function(st, i) { if (st && typeof st.label === 'string') html += '<div class="menu-item cm-session" data-act="dkst" data-k="' + i + '" title="Every cell of this map is at this step, but where a shape sets its own or a light lights it">' + (st.key === dkNow ? '<i class="wib wi-check"></i> ' : '') + esc(st.label) + '</div>'; }); }
        if (amPin && amPin.type === 'map' && scSys.length && window.wpCanPersistLocal && window.wpCanPersistLocal()) { html += head('Scene'); scSys.forEach(function(sc, i) { if (sc && typeof sc.label === 'string') html += '<div class="menu-item cm-session" data-act="scch" data-k="' + i + '" title="Rolls read the scene as this channel">' + (sc.key === scNow ? '<i class="wib wi-check"></i> ' : '') + esc(sc.label) + '</div>'; }); if (scNow) html += '<div class="menu-item cm-session" data-act="scend" title="No channel, and every reaction kept on this map goes">End the scene</div>'; }
        if (amPin && amPin.type === 'map') html += '<div class="menu-item cm-session" data-act="mapprops" title="This map\u2019s own settings, its scene page among them, in the Properties panel. Its X closes it."><i class="wib wi-props"></i> Map properties</div>';   // 1.6.2: the Properties tab at the map's edge was the way to them with nothing selected (the owner removed it, 2026-11-14)
        if (amPin && amPin.type === 'map') html += '<div class="menu-item cm-session" data-act="pin" title="Pinned maps sit at the top of the Maps list"><i class="wib wi-pin"></i> ' + (isPinned ? 'Unpin this map' : 'Pin this map') + '</div>';
        if (role !== 'host') html += '<div class="menu-item cm-session" data-act="log"><i class="wib wi-scroll"></i> Game Record\u2026</div>';
        html += '<div class="menu-divider"></div>';
        html += castMenuHtml(camp);
        if (role === 'host') {
            html += '<div class="menu-divider"></div>' + head('Session');
            var amM = getActiveMap(), combatM = amM && typeof window.wpStripFight === 'function' ? window.wpStripFight(amM.id) : null;   // fold 2: the fight the strip shows
            if (combatM) {
                var curM = combatM.rows[combatM.turn] || {};
                html += '<div class="menu-item cm-session" data-act="combat-next" title="Round ' + combatM.round + ' — ' + esc(curM.name || '') + ' is up"><i class="wib wi-fight"></i> Next Turn</div>';
                html += '<div class="menu-item cm-session" data-act="combat-prev"><i class="wib wi-back"></i> Previous Turn</div>';
                html += '<div class="menu-item cm-session" data-act="combat-edit"><i class="wib wi-pen"></i> Combat Roster\u2026</div>';
                html += '<div class="menu-item cm-session" data-act="combat-end" style="color:var(--danger)">End Combat</div>';
                html += '<div class="menu-item cm-session" data-act="combat-new" title="Another fight on this map, with its own order and rounds. A token is in one fight at a time"><i class="wib wi-fight"></i> Start another fight here\u2026</div>';
            } else html += '<div class="menu-item cm-session" data-act="combat" title="Pick who is in the fight, give initiative, run the turns"><i class="wib wi-fight"></i> Start combat\u2026</div>';
            html += '<div class="menu-item cm-session" data-act="notepad"><i class="wib wi-note"></i> ' + (n.notepad && n.notepad.on ? (typeof n.notepadHidden === 'function' && n.notepadHidden() ? 'Show Table Notepad' : 'Put Away Table Notepad') : 'Open Table Notepad') + '</div>';
            html += '<div class="menu-divider"></div>';
            html += '<div class="menu-item cm-session" data-act="summon"><i class="wib wi-summon"></i> Summon Everyone Here</div>';
            html += '<div class="menu-item cm-session" data-act="travel">' + (n.travelLocked ? '<i class="wib wi-lock"></i> Allow travel between maps' : '<i class="wib wi-unlock"></i> Lock travel between maps')   /* 1.6.2 (backlog 230): every lock shows how it stands now */ + '</div>';
            html += '<div class="menu-item cm-session" data-act="pause">' + (n.paused ? '<i class="wib wi-play"></i> Resume the table' : '<i class="wib wi-pause"></i> Pause the table') + '</div>';
            html += '<div class="menu-item cm-session" data-act="log"><i class="wib wi-scroll"></i> Game Record\u2026</div>';
            html += '<div class="menu-item cm-session" data-act="end" style="color:var(--danger)">End session for everyone</div>';
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
                else if (act === 'dkst') {   // 1.6.2: the map's darkness step
                    var amD = getActiveMap(), cD = getActiveCampaign(), lD = cD && cD.system && Array.isArray(cD.system.dark) ? cD.system.dark : [], kD = /^\d{1,2}$/.test(it.dataset.k || '') ? lD[Number(it.dataset.k)] : null;
                    if (amD) { amD.meta = amD.meta || {}; if (kD && typeof kD.key === 'string') amD.meta.dark = kD.key; else delete amD.meta.dark; if (window.wpStepLog) window.wpStepLog('dark v1', 'map', {}); save(); render(); toast(kD ? 'This map is ' + kD.label + '.' : 'This map is lit.'); }
                }
                else if (act === 'scch' || act === 'scend') {   // 1.6.2: the scene's channel on this map, or its end
                    var amS = getActiveMap(), cS = getActiveCampaign(), lS = cS && cS.system && Array.isArray(cS.system.scenes) ? cS.system.scenes : [], kS = act === 'scch' && /^\d{1,2}$/.test(it.dataset.k || '') ? lS[Number(it.dataset.k)] : null;
                    if (amS) { amS.meta = amS.meta || {}; if (kS && typeof kS.key === 'string') amS.meta.scene = kS.key; else { delete amS.meta.scene; (amS.whiteboard || []).forEach(function(w) { if (w && w.reaction !== undefined) delete w.reaction; }); } if (window.wpStepLog) window.wpStepLog('scene v1', act === 'scch' ? 'channel' : 'end', {}); save(); render(); toast(kS ? 'The scene is ' + kS.label + '.' : 'The scene is over.'); }
                }
                else if (act === 'pin') {
                    var campP = getActiveCampaign(), amP = getActiveMap(); if (!campP || !amP) return;
                    campP.pinnedMaps = (Array.isArray(campP.pinnedMaps) ? campP.pinnedMaps : []).filter(function(id) { return campP.items[id]; });
                    var atP = campP.pinnedMaps.indexOf(amP.id);
                    if (atP >= 0) campP.pinnedMaps.splice(atP, 1); else campP.pinnedMaps.push(amP.id);
                    import('./io.js').then(function(m) { m.save(true); m.toast(atP >= 0 ? 'Unpinned.' : 'Pinned. It sits at the top of the Maps list now.'); });
                    import('./sidebar.js').then(function(m) { m.updateSidebarNav(); });
                }
                else if (act === 'setups') { var suM = getActiveMap(); if (suM && window.wpSetups) window.wpSetups.open(suM.id); }   // backlog 31
                else if (act === 'mapprops') { state.selWbIds = []; state.selWbId = null; render(); if (window.wpOpenRightPanel) window.wpOpenRightPanel(); }   // nothing selected: Properties shows the map's own settings
                else if (act === 'scene') { if (window.wpPageShelf) window.wpPageShelf.open(it.dataset.id, window.wpPageShelf.wayNow(ce), it.dataset.at ? { at: it.dataset.at } : undefined); }   // 1.5.4 (pageshelf.js): over the map by a plain click, as every page asked for from the play map
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
// [systemcheck:grouproll-menu-start]
// 1.6.0 (v2, B7a): Group roll on the GM's menu for two or more character tokens: a flyout of the system's checks by name, and the one with the
// lowest target rolls once for everyone picked (wpSheets.groupRoll). A roll's label is the one word of the system it writes, escaped
function groupRollModel(map, ids) {
    var S = window.wpSheets; if (!map || !Array.isArray(map.whiteboard) || !Array.isArray(ids) || ids.length < 2 || !S || typeof S.groupRollsFor !== 'function') return null;
    var cids = []; ids.forEach(function(id) { var w = map.whiteboard.find(function(x) { return x.id === id; }); if (w && typeof w.charId === 'string' && w.charId && !w.waiting && cids.indexOf(w.charId) < 0) cids.push(w.charId); });
    var rolls = cids.length > 1 ? S.groupRollsFor(cids) : []; return rolls.length ? { ids: cids, rolls: rolls } : null;
}
function groupRollHtml(m) {
    if (!m) return '';
    var h = '<div class="menu-item cm-grp-open" title="The one with the lowest target for the roll rolls once for everyone picked"><span><i class="wib wi-die"></i> Group roll</span><span style="margin-left:auto; color:var(--dim);">&#8250;</span><div class="cm-sub">';
    m.rolls.forEach(function(r, i) { h += '<div class="menu-item cm-grp-roll" data-i="' + i + '">' + gmEsc(String(r.label).slice(0, 60)) + '</div>'; });
    return h + '</div></div>';
}
function groupRollWire(cMenu, m) {
    var open = cMenu.querySelector('.cm-grp-open'); if (!open || !m) return;
    open.addEventListener('click', function(ce) { ce.stopPropagation(); var row = ce.target && ce.target.closest ? ce.target.closest('.cm-grp-roll') : null, g = row ? m.rolls[+row.dataset.i] : null; if (!row) { open.classList.toggle('open'); return; } cMenu.style.display = 'none'; if (g) window.wpSheets.groupRoll(m.ids, g.id); });
}
// [systemcheck:grouproll-menu-end]
// [systemcheck:gmfight-start]
// The GM's own rows on a character token's menu at a hosted table (the owner, 2026-10-04: "theres no way for me to target a player as an NPC
// and start combat, or join combat"): Target (the GM's one pointer, which an NPC's rolls read the range by and which ticks its token when a
// fight starts), Start combat with the tokens picked, and for a fight already running on this map Add to the fight / Remove from the fight.
// Fixed words only: nothing of a token is written into the menu.
function gmFightModel(map, items, sel) {   // sel (158): the one token the GM has selected, which can target the token under the pointer
    var n = window.wpNet; if (!n || !(n.active ? n.role === 'host' : (n.solo || (typeof n.soloOk === 'function' && n.soloOk()))) || window.wpStream || !map || !Array.isArray(items)) return null;   // 1.6.2: and with no table open
    var toks = items.filter(function(w) { return !!(w && w.isChar && !w.waiting); }); if (!toks.length) return null;
    var ids = typeof n.fightsOn === 'function' ? n.fightsOn(map.id) : [], inIds = Object.create(null);   // fold 2: every fight on this map; a token is in one at most
    ids.forEach(function(f) { var c = n.combats[f]; if (c && Array.isArray(c.rows)) c.rows.forEach(function(r) { if (r && typeof r.tokId === 'string') inIds[r.tokId] = f; }); });
    var one = toks.length === 1 && items.length === 1 && !toks[0].hidden ? toks[0] : null, t = n.targets && n.myId ? n.targets[n.myId] : null;
    var as = one && sel && typeof sel === 'object' && sel.isChar && !sel.waiting && sel.id !== one.id && (map.whiteboard || []).indexOf(sel) >= 0 ? sel : null, ta = as && n.targets ? n.targets['tk:' + as.id] : null;   // 158: Target as the selected character
    var clears = one && n.targets && typeof n.clearTargetOf === 'function' ? Object.keys(n.targets).filter(function(k) { var p = n.targets[k]; return k !== n.myId && !!p && typeof p === 'object' && p.id === one.id && p.mapId === map.id; }).slice(0, 12).map(function(k) { return { pid: k, name: String(n.targets[k].name || 'Player').slice(0, 40) }; }) : [];   // 1.5.9: each pointer someone else holds at it, which the GM may clear
    var hd = one && typeof n.holdsAt === 'function' ? n.holdsAt(map.id, as, one) : null;   // 1.6.0 Who holds whom: the GM's own hand on a token in a fight
    return { holds: hd, toks: toks, running: ids.length > 0, fights: ids, add: toks.filter(function(w) { return typeof inIds[w.id] !== 'string'; }), drop: toks.filter(function(w) { return typeof inIds[w.id] === 'string'; }), target: one, mine: !!(one && t && t.id === one.id && t.mapId === map.id), as: as, asMine: !!(as && ta && ta.id === one.id && ta.mapId === map.id), clears: clears };
}
function gmEsc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }   // 158: a character's name, the one word of a token this menu writes
function gmFightHtml(m) {
    if (!m) return '';
    var h = '';
    if (m.target && m.as) { var asN = gmEsc(String(m.as.charName || m.as.name || 'your character').slice(0, 40)); h += '<div class="menu-item cm-gm-fight" data-fight="targetas" title="' + (m.asMine ? 'Stop ' + asN + ' targeting it' : asN + ' targets it: its rolls read the range from its own token, and the facing rules know where the attack comes from') + '">' + (m.asMine ? '<i class="wib wi-ring"></i> ' + asN + ' stops targeting' : '<i class="wib wi-target"></i> Target as ' + asN) + '</div>'; }
    if (m.target) h += '<div class="menu-item cm-gm-fight" data-fight="target" title="' + (m.mine ? 'Stop targeting it (Esc does too)' : 'Point at it as the GM: your NPCs&rsquo; rolls read the range to it, and it is ticked when you start a fight (T while pointing at a token does the same)') + '">' + (m.mine ? '<i class="wib wi-ring"></i> Clear target' : '<i class="wib wi-target"></i> Target') + '</div>';
    if (m.target && Array.isArray(m.clears)) m.clears.forEach(function(c, i) { var cN = gmEsc(c.name); h += '<div class="menu-item cm-gm-fight" data-fight="clear:' + i + '" title="Take ' + cN + '&rsquo;s target pointer off this token. Everyone at the table sees it go"><i class="wib wi-ring"></i> Clear ' + cN + '&rsquo;s target</div>'; });   // 1.5.9: the row says the pointer by its place in the model, never by its key
    if (m.holds && m.target) {   // 1.6.0 Who holds whom: the GM's correction, the selected character on the token under the pointer
        var hdN = m.as ? gmEsc(String(m.as.charName || m.as.name || 'your character').slice(0, 40)) : '';
        if (m.holds.can) h += '<div class="menu-item cm-gm-fight" data-fight="holdtake" title="' + hdN + ' takes hold of it"><i class="wib wi-fight"></i> ' + hdN + ' holds it</div>';
        if (m.holds.has && !m.holds.pin) h += '<div class="menu-item cm-gm-fight" data-fight="holdpin" title="' + hdN + ' pins it"><i class="wib wi-fight"></i> ' + hdN + ' pins it</div>';
        if (m.holds.has) h += '<div class="menu-item cm-gm-fight" data-fight="holdfree" title="' + hdN + ' lets go of it"><i class="wib wi-fight"></i> ' + hdN + ' lets go</div>';
        if (m.holds.any) h += '<div class="menu-item cm-gm-fight" data-fight="holdall" title="Every hold on it, and every hold it has, ends"><i class="wib wi-fight"></i> End its holds</div>';
    }
    if (!m.running) h += '<div class="menu-item cm-gm-fight" data-fight="start" title="Open the roster with ' + (m.toks.length === 1 ? 'this token' : 'these tokens') + ' ticked, and whoever is targeted"><i class="wib wi-fight"></i> Start combat&hellip;</div>';
    else {
        var two = Array.isArray(m.fights) && m.fights.length > 1;
        if (m.add.length) h += '<div class="menu-item cm-gm-fight" data-fight="add" title="' + (two ? 'Into one of the fights running on this map: you pick which. It goes at the end of the order' : 'Into the fight running on this map, at the end of the order') + ' (its initiative is given or rolled in the roster)"><i class="wib wi-fight"></i> Add to the fight</div>';
        if (m.drop.length) h += '<div class="menu-item cm-gm-fight" data-fight="drop" title="Out of the fight it is in on this map"><i class="wib wi-fight"></i> Remove from the fight</div>';
        if (m.add.length) h += '<div class="menu-item cm-gm-fight" data-fight="new" title="Another fight on this map, with ' + (m.add.length === 1 ? 'this token' : 'these tokens') + ' ticked: its own order and rounds"><i class="wib wi-fight"></i> Start another fight&hellip;</div>';   // fold 2
    }
    return h;
}
function gmFightDo(map, m, act) {
    var n = window.wpNet; if (!m || !n || !map) return false;
    if (act === 'target') { if (!m.target || !n.setTarget) return false; n.setTarget(m.target.id, map.id, m.target.charName || m.target.name); return true; }
    if (act === 'targetas') { if (!m.target || !m.as || !n.setTargetAs) return false; return n.setTargetAs(m.as, m.target.id, map.id, m.target.charName || m.target.name) === true; }
    if (typeof act === 'string' && /^clear:\d{1,2}$/.test(act)) { var cl = Array.isArray(m.clears) ? m.clears[Number(act.slice(6))] : null; if (!cl || typeof n.clearTargetOf !== 'function') return false; return n.clearTargetOf(cl.pid) === true; }   // 1.5.9
    if (typeof act === 'string' && /^hold(take|pin|free|all)$/.test(act)) { if (!m.target || typeof n.holdSet !== 'function') return false; return n.holdSet(map.id, m.as || null, m.target, act.slice(4)) === true; }   // 1.6.0 Who holds whom
    if (act === 'start') { if (m.running) return false; openCombatModal(map.id, { pre: m.toks.map(function(w) { return w.id; }) }); return true; }   // 1.6.3 (finding 15): a hidden token picked comes ticked too
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
function gmFightPut(n, map, fid, add, out) {   // that fight with the tokens added at the end of its order (one coming back by its number), or those out taken out (its last row taken out ends it, asked first)
    var c = n.combats[fid]; if (!c || !Array.isArray(c.rows)) return false;
    var rows = c.rows.map(function(r) { var o = { id: r.id, name: r.name, tokId: r.tokId, init: r.init, src: r.src }; if (r.rolled === 1) o.rolled = 1; if (Array.isArray(r.tb)) o.tb = r.tb; if (r.held === 1) o.held = 1; return o; }), curId = (c.rows[c.turn] || {}).id;
    // 1.6.3 (the combat review, finding 13): on a counting clock a row at 0 never acts, so a token added with no number of its own rolls the system's initiative roll for
    // its count, as Roll all would (in private where a player cannot see it); one that still has none is said
    var ckP = typeof rosterShape === 'function' && typeof getActiveCampaign === 'function' && rosterShape(getActiveCampaign()).kind === 'clock', shP = typeof window !== 'undefined' ? window.wpSheets : null, never = [];
    if (add) add.forEach(function(w) { var was = typeof n.fightWas === 'function' ? n.fightWas(fid, w.id) : null, o = { id: 'r' + w.id, name: typeof rowNameOf === 'function' ? rowNameOf(w, map) : w.charName || w.name || 'Unnamed', tokId: w.id, init: was ? was.init : 0, src: w.src || null }; if (was && was.rolled) o.rolled = 1;
        if (ckP && !was && typeof w.charId === 'string' && shP && typeof shP.hasInitRoll === 'function' && shP.hasInitRoll() && typeof shP.rollInit === 'function') { var rrP = shP.rollInit(w.charId, { priv: !!w.hidden || (typeof n.tokUnseen === 'function' && n.tokUnseen(map.id, w.id)), tok: w.id }); if (rrP && typeof rrP.value === 'number' && isFinite(rrP.value)) { o.init = rrP.value; o.rolled = 1; } }
        if (ckP && !(Number(o.init) > 0)) never.push(o.name);
        var low = was ? rows.findIndex(function(r) { return !(Number(r.init) >= o.init); }) : -1; if (low >= 0) rows.splice(low, 0, o); else rows.push(o); });   // one coming back stands where its number puts it, the row on turn kept below
    if (out) { rows = rows.filter(function(r) { return !(typeof r.tokId === 'string' && out[r.tokId] === 1); }); if (!rows.length) { n.fightEnd(fid); return true; } }
    var at = rows.findIndex(function(r) { return r.id === curId; });
    n.fightSet(fid, { mapId: map.id, round: c.round, turn: at >= 0 ? at : Math.min(c.turn, rows.length - 1), rows: rows });
    if (never.length && typeof clockNeverWords === 'function' && typeof toast === 'function') toast(clockNeverWords(never));
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
function gmRulesHtml(m) { return m ? '<div class="menu-item cm-gm-rules" role="menuitemcheckbox" aria-checked="' + (m.on ? 'true' : 'false') + '" title="Ticked, this NPC&rsquo;s time rules run by themselves as time passes. Unticked, they do not. With the Calendar on, its runs wait unticked in the Calendar&rsquo;s list">' + (m.on ? '&#10003; ' : '') + '<i class="wib wi-hourglass"></i> Rules run</div>' : ''; }
function gmRulesDo(m) { var C = window.wpCalendar; return !!(m && C && typeof C.setRulesRun === 'function' && C.setRulesRun(m.charId, !m.on) === true); }   // the press: the switch the other way
// T while pointing at a token, for the GM at a hosted table: the same pointer as the menu's Target
function gmCanTarget(tok) { var n = window.wpNet; return !!(tok && tok.isChar && !tok.hidden && !tok.waiting && n && (n.active ? n.role === 'host' : (n.solo === true || (typeof n.soloOk === 'function' && n.soloOk()))) && !window.wpStream); }   // 1.6.2: and with no table open
function gmTarget(tok, mapId) { var n = window.wpNet; if (!gmCanTarget(tok) || !n.setTarget || typeof mapId !== 'string') return false; n.setTarget(tok.id, mapId, tok.charName || tok.name); return true; }
// [systemcheck:gmfight-end]
// 1.6.2 (backlog 42, fold 3; the owner: "A. Token menu and Characters row"): Can be looted, a tick row for one shown NPC token, the GM's alone.
// Whether there is one and which way it stands is the sheet module's (lootOf), and it is set there alone (lootSet). Fixed words only
function gmLootModel(items) {
    var n = window.wpNet, S = window.wpSheets; if (window.wpStream || (n && (n.foreign || (n.active && n.role === 'client'))) || !S || typeof S.lootOf !== 'function' || !Array.isArray(items) || items.length !== 1) return null;
    var w = items[0]; if (!w || typeof w !== 'object' || !w.isChar || w.waiting || w.hidden || typeof w.charId !== 'string' || !w.charId) return null;
    var on = S.lootOf(w.charId); return on === true || on === false ? { charId: w.charId, on: on } : null;
}
function gmLootHtml(m) { return m ? '<div class="menu-item cm-gm-loot" role="menuitemcheckbox" aria-checked="' + (m.on ? 'true' : 'false') + '" title="Ticked, a player next to it can search it and take what its lists ticked Tradable hold">' + (m.on ? '&#10003; ' : '') + '<i class="wib wi-chest"></i> Can be looted</div>' : ''; }
function gmLootDo(m) { var S = window.wpSheets; return !!(m && S && typeof S.lootSet === 'function' && S.lootSet(m.charId, !m.on) === true); }
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
        // same permission line as moving it); empty play-map space offers Leave session
        if (state.viewMode === 'visual' && e.target.closest('#whiteboardWrap')) {
            var ownEl = e.target.closest('.wb-item');
            var ownW = ownEl && getActiveMap() ? (getActiveMap().whiteboard || []).find(function(x) { return x.id === ownEl.dataset.id; }) : null;
            if (!(ownW && (ownW.isChar || ownW.waiting)) && showMineMenu(e)) return;   // 1.6.2: a token comes first; else a drawing of their own to show
            if (ownEl) {
                var amO = getActiveMap(), tokO = amO && (amO.whiteboard || []).find(function(x) { return x.id === ownEl.dataset.id; });
                if (tokO && tokO.waiting && tokO.ownerId === window.wpNet.myId) { e.preventDefault(); if (window.wpJoinCard) window.wpJoinCard.show(); }   // Onboarding F1a: their waiting token: where they stand
                else if (tokO && tokO.isChar && tokO.ownerId === window.wpNet.myId && !(window.wpNet.paused || window.wpNet.selfPaused || window.wpNet.selfHeld || window.wpNet.reconnecting) && (stanceOn('elevation') || stanceOn('posture') || (tokO.charId && window.wpSheets && window.wpSheets.canOpen(tokO.charId)) || ownLightHtml(tokO) || ownPicOk(tokO) || tokenSensesLine(tokO) || (window.wpSheets && window.wpSheets.tokenFxModel && window.wpSheets.tokenFxModel(tokO)))) { e.preventDefault(); showStanceMenu(e, tokO); }
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
    } else if (e.target.closest('#elementList, #layersList')) {
        isCanvasOrWb = true;
        isWb = (state.viewMode === 'visual');
        var listEl = e.target.closest('.el-name');
        if (listEl) targetId = listEl.dataset.id;
    }
    
    if (isCanvasOrWb) {
        e.preventDefault();
        
        var selectedIds = [];
        var preSel = [];   // 1.6.3 (the combat review's batch "strip", finding 17): the selection as it stood before this right-click selected what it is on
        if (isWb) {
            selectedIds = state.selWbIds || (state.selWbId ? [state.selWbId] : []); preSel = selectedIds.slice();
            if (targetId && !selectedIds.includes(targetId)) { selectedIds = [targetId]; state.selWbIds = [targetId]; state.selWbId = targetId; if (window.appRender) window.appRender(); }   // 1.6.2 (the owner, 2026-11-12: "when right clicking something it should highlight like when its clicked to be selected"): a right-click selects what its menu acts on, so it is lit while the menu is up
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
            if (sheetTop) { html += '<div class="menu-item cm-sheet"><i class="wib wi-clip"></i> ' + (firstItem.charId ? 'Sheet&hellip;' : 'New character sheet&hellip;') + '</div>'; if (firstItem.charId && window.wpSheets.hudFor && window.wpSheets.hudFor(firstItem.charId)) html += '<div class="menu-item cm-hud"><i class="wib wi-hud"></i> HUD&hellip;</div>'; }
            if (sheetTop && firstItem.charId && window.wpSheets.canDamage && window.wpSheets.canDamage(firstItem.charId)) html += '<div class="menu-item cm-dmg" title="Apply a blow to this character: its DR first, then its wounds, and the wear on what it wears"><i class="wib wi-fight"></i> Take damage&hellip;</div>';   // 1.5.6, the damage step
            // 1.6.3 (finding 17): the one token selected BEFORE the right-click, which may target, trade as or hold the token under the pointer. The right-click selects what it
            // is on (the owner, 2026-11-12), so read after it the selection was always that token, and Target as, Trade as and the GM's Who holds whom were never offered
            var selNow = preSel.length ? preSel : state.selWbIds && state.selWbIds.length ? state.selWbIds : (state.selWbId ? [state.selWbId] : []), selAs = isWb && selNow.length === 1 ? am.whiteboard.find(function(x) { return x.id === selNow[0]; }) : null;   // 158: the one token selected, which may target the token under the pointer
            var gmF = isWb ? gmFightModel(am, selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }).filter(Boolean), selAs) : null; html += gmFightHtml(gmF);   // the GM's own Target, Start combat, Add to the fight
            var gmR = isWb ? gmRulesModel(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }).filter(Boolean)) : null; html += gmRulesHtml(gmR); var gmL = isWb ? gmLootModel(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }).filter(Boolean)) : null; html += gmLootHtml(gmL);   // 152 fold 4b: an NPC's Rules run switch
            var grpM = isWb ? groupRollModel(am, selectedIds) : null; html += groupRollHtml(grpM);   // 1.6.0 (v2, B7a): Group roll
            if (sheetTop && firstItem.charId && window.wpTrade && window.wpTrade.canAsk) { var trQ = window.wpTrade.canAsk(firstItem, am, selAs); if (trQ) html += '<div class="menu-item cm-trade" title="Open a barter window: each side puts items and money on the table, and both confirm"><i class="wib wi-trade"></i> ' + esc(trQ.label) + '</div>'; }   // 1.5.6 trading: as the one NPC selected
                        if (isWb) {   // 1.6.2 (the owner: "Used rows first"): Hide, Lock, Duplicate and Delete, right after the sheet and the fight rows
                if (!(window.wpNet && (window.wpNet.foreign || (window.wpNet.active && window.wpNet.role === 'client')))) html += '<div class="menu-item cm-props" title="Open this piece&rsquo;s settings at the right edge of the map"><i class="wib wi-props"></i> Properties</div>';   // 1.6.2 (backlog 229; the owner, by prompt: "Row only, no double-click")
                var anyVisible = selectedIds.some(function(sid) {
                    var it = am.whiteboard.find(function(x) { return x.id === sid; });
                    return it && !it.hidden;
                });
                html += '<div class="menu-item cm-vis">' + (anyVisible ? '<i class="wib wi-unseen"></i> Hide from players' : '<i class="wib wi-seen"></i> Show to players') + '</div>';
                var anyUnlocked = selectedIds.some(function(sid) {
                    var it = am.whiteboard.find(function(x) { return x.id === sid; });
                    return it && !it.locked;
                });
                // the piece's own lock, worded as what it does; the padlock shows how the piece stands, as the toolbar's does (a door's lock for players is a row of its own: doorRows)
                html += '<div class="menu-item cm-lock" title="' + (anyUnlocked ? 'It stays where it is: no drag and no resize until you unlock it, and a player&rsquo;s token is frozen for its player too. On a door this is not the lock of the door itself.' : 'It can be dragged and resized again.') + '">' + (anyUnlocked ? '<i class="wib wi-anchor-off"></i> Lock in place' : '<i class="wib wi-anchor"></i> Unlock so it can move') + '</div>';
                html += structRowHtml(structRow(am));   // 231: the whole map's structure, locked or freed with one press
                html += '<div class="menu-item cm-dup"><i class="wib wi-dup"></i> Duplicate</div>';
                html += '<div class="menu-item cm-del" style="color:var(--danger)">Delete</div>';
                html += '<div class="menu-divider"></div>';
            } else if (!(window.wpNet && (window.wpNet.foreign || (window.wpNet.active && window.wpNet.role === 'client')))) html += '<div class="menu-item cm-props" title="Open this room&rsquo;s settings at the right edge of the map: its notes, who is here, its place on the play map"><i class="wib wi-props"></i> Properties</div>';   // 1.6.2: on the Data Map too, the room the right-click selected

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
                    return it && it.type === 'path' && it.tip !== 'fill' && !it.locked;   // 1.6.3, the review of 87d9b6e0: a locked line (a wall laid by Build, the map's structure) is never merged away without a word
                });
                if (allPaths) {
                    html += '<div class="menu-item cm-merge">Merge drawings</div>';
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
                var anyUnderGrid = selectedIds.some(function(sid) {
                    var it = am.whiteboard.find(function(x) { return x.id === sid; });
                    return it && !it.aboveGrid;
                });
                html += '<div class="menu-item cm-grid">' + (anyUnderGrid ? '&#9650; Show above grid' : '&#9660; Put under grid') + '</div>';
                var swRow = showRow(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }));   // 1.6.2: a drawing to show, only where the selection holds a pen drawing
                if (swRow) html += swRow.html;
                var mnRow = mineRow(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }));   // 1.5.8 explosives: a placed mine set off by hand
                if (mnRow) html += mnRow.html;
                var rmRow = typeof pieceRoomRow === 'function' ? pieceRoomRow(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }), am) : null;   // 1.6.2 (backlog 45): a room for this piece on the Data Map
                if (rmRow) html += rmRow.html;
                var rsRow = typeof roomShowRow === 'function' ? roomShowRow(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }), am) : null;   // 1.6.2 (backlog 45, fold 3): Show on the Data Map
                if (rsRow) html += rsRow.html;
                var bxRow = typeof boxOpenRow === 'function' ? boxOpenRow(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); })) : null;   // 1.6.2 (backlog 42): Open contents
                if (bxRow) html += bxRow.html;
                var ppRow = pagePinRow(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }));   // 1.5.4: a pin's row, where the one piece selected opens a page
                if (ppRow) html += ppRow.html;
                var drRow = doorRows(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }));   // a door's own rows: open or close it, lock it for players
                if (drRow) html += drRow.html;
                var scRow = secretRow(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }));   // the map builder: a secret door's row, Reveal or Make
                if (scRow) html += scRow.html;
                var hzRow = typeof hazardRows !== 'function' ? null : hazardRows(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }));   // 1.6.2: a map hazard's rows, Roll for everyone in it and Spread fire
                if (hzRow) html += hzRow.html;
                var plRow = portalLockRow(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }), am);   // a portal's own lock: the GM's row, only where the selection holds a portal
                if (plRow) html += plRow.html;
                var fhRow = fogHandRows(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }));   // 1.5.4: a piece's fog mark, only where the selection holds a piece that may carry one
                if (fhRow) html += fhRow.html;
                html += '<div class="menu-divider"></div>';
                var wlRow = wallsRow(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }));   // the map builder: walls around the selected floors, a group of its own
                if (wlRow) html += wlRow.html + '<div class="menu-divider"></div>';
            }
            var flRow = isWb && typeof flatRows === 'function' ? flatRows(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); })) : null;   // 1.6.2 (backlog 39): Flatten, and Unflatten
            if (flRow) html += flRow.html + '<div class="menu-divider"></div>';
            // 1.6.2 (the owner: "stacking folded"): one Order row opens the four stacking rows in place
            html += '<div class="menu-item cm-order" aria-expanded="false" title="Bring to front, forward, backward or send to back">Order &#9656;</div>';
            html += '<div class="cm-stackrows" hidden><div class="menu-item cm-front">Bring to front</div><div class="menu-item cm-fwd">Bring forward</div><div class="menu-item cm-bwd">Send backward</div><div class="menu-item cm-back">Send to back</div></div>';

            if (isWb) {
                var curOp = Math.round(((firstItem && firstItem.opacity != null) ? firstItem.opacity : 1) * 100);
                html += '<div class="menu-divider"></div>';
                html += '<div class="menu-item cm-opacity" style="display:flex; align-items:center; gap:6px; cursor:default;">Opacity <input type="range" id="cmOpacitySlider" min="10" max="100" value="' + curOp + '" style="flex:1; min-width:80px;"> <span id="cmOpacityVal" style="min-width:34px; text-align:right;">' + curOp + '%</span></div>';
            }

            html += '<div class="menu-divider"></div>';
            if (isWb && firstItem && firstItem.isChar) {
                html += '<div class="menu-divider"></div>';
                html += '<div class="menu-item cm-status-alive"><i class="wib wi-heart"></i> Alive</div>';
                html += '<div class="menu-item cm-status-down"><i class="wib wi-heartbreak"></i> Incapacitated</div>';
                html += '<div class="menu-item cm-status-dead">&#9760; Dead</div>';
                html += stanceMenuHtml(firstItem);
                html += tokenSensesLine(firstItem);   // senses S3: its senses, read-only
            }
            if (!sheetTop) {   // several pieces selected: where the two rows always stood (one character token lists them first, above)
            if (isWb && firstItem && (firstItem.isChar || firstItem.charId) && window.wpSheets) html += '<div class="menu-item cm-sheet"><i class="wib wi-clip"></i> ' + (firstItem.charId ? 'Sheet&hellip;' : 'New character sheet&hellip;') + '</div>';
            if (isWb && firstItem && firstItem.charId && window.wpSheets && window.wpSheets.hudFor && window.wpSheets.hudFor(firstItem.charId)) html += '<div class="menu-item cm-hud"><i class="wib wi-hud"></i> HUD&hellip;</div>';   // HUD frame (HF2b)
            }
            if (isWb && firstItem && selectedIds.length === 1 && window.wpSheets && window.wpSheets.tokenFxModel && window.wpSheets.tokenFxModel(firstItem)) html += '<div class="menu-item cm-effects"><i class="wib wi-spark"></i> Effects&hellip;</div>';   // conditions C2
            if (isWb && firstItem && firstItem.isChar && !firstItem.waiting && firstItem.type === 'image' && firstItem.src && window.wpFrame && window.wpSheets && window.wpSheets.applyTokenFrame) html += '<div class="menu-item cm-frame-pic"><i class="wib wi-pic"></i> Frame picture&hellip;</div>';
            if (isWb && selectedIds.length === 1 && sceneSrcOf(firstItem) && window.wpScene) html += '<div class="menu-item cm-scene-show" title="Show this picture big to everyone or to some players, without moving anyone">' + '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9.5h14v10H5zM5 17l4-3.5 3 2.5 2-1.5 5 3.5M12 2.5v3.5M7 4l1.5 2.5M17 4l-1.5 2.5"/></svg>' + 'Show as a scene&hellip;</div>';   // backlog 181   // the token creator: the selected tokens (a character's change together)
            var gmLit = isWb ? gmLightToggle(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); })) : null;   // lighting L5: the selected lights, switched together
            if (gmLit) html += '<div class="menu-item cm-light"><i class="wib wi-bulb"></i> ' + (gmLit.anyOn ? 'Light off' : 'Light on') + '</div>';
            if (isWb && firstItem && firstItem.isChar && firstItem.ownerId && window.wpNet && window.wpNet.active && window.wpNet.role === 'host' && window.wpNet.isConnected && window.wpNet.isConnected(firstItem.ownerId)) {
                var pausedTok = window.wpNet.isPlayerPaused && window.wpNet.isPlayerPaused(firstItem.ownerId);
                html += '<div class="menu-item cm-player-pause">' + (pausedTok ? '<i class="wib wi-play"></i> Resume this player' : '<i class="wib wi-pause"></i> Pause this player') + '</div>';
            }
            if (isWb && firstItem && firstItem.isChar && firstItem.ownerId && !(window.wpNet && window.wpNet.active && window.wpNet.role === 'client') && !window.wpStream && window.wpTrackers && window.wpTrackers.on && window.wpTrackers.on()) html += '<div class="menu-item cm-trk-hide">' + (window.wpTrackers.hidden(firstItem.ownerId) ? '&#9745; ' : '&#9744; ') + 'Hide table trackers from them</div>';   // backlog 29
            if (isWb && firstItem && firstItem.id && !firstItem.hidden && window.wpFx && window.wpVtt && window.wpVtt.on('fx')) html += '<div class="menu-item cm-pulse"><i class="wib wi-spark"></i> Pulse</div>';
            if (!isWb) html += '<div class="menu-item cm-dup"><i class="wib wi-dup"></i> Duplicate</div>';   // the data map keeps them at its foot: the play map has them first
            if (isWb && firstItem && (firstItem.isChar || firstItem.charName)) html += '<div class="menu-item cm-cast-save"><i class="wib wi-starf"></i> Save to Campaign Cast</div>';
            var osN = isWb && firstItem && firstItem.isChar && window.wpSheets && window.wpSheets.ownSheetCount ? window.wpSheets.ownSheetCount(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }).filter(Boolean)) : 0;   // 1.6.2 (backlog 237): the GM's alone (ownSheetCount answers 0 elsewhere), where a picked token shares its sheet with another
            if (osN) html += '<div class="menu-item cm-own-sheet" title="A copy of the sheet for ' + (osN === 1 ? 'this token' : 'each of them') + ', so a hit on one no longer hurts the others"><i class="wib wi-dup"></i> ' + (osN === 1 && selectedIds.length === 1 ? 'Give this token its own sheet' : 'Give ' + osN + (osN === 1 ? ' token its own sheet' : ' tokens their own sheets')) + '</div>';
            if (isWb && firstItem && firstItem.isChar && !(window.wpNet && window.wpNet.active && window.wpNet.role === 'client') && window.wpCanPersistLocal && window.wpCanPersistLocal()) html += '<div class="menu-item cm-encounter-save" title="Save the selected character tokens as an encounter group in the Image Library, placed again in one press">Save as an encounter group\u2026</div>';   // backlog 31
            if (!isWb) html += '<div class="menu-item cm-del" style="color:var(--danger)">Delete</div>';

            cMenu.innerHTML = html;
            cMenu.style.display = 'flex';
            placeMenu(cMenu, e);
            Array.prototype.forEach.call(cMenu.querySelectorAll('.cm-gm-fight'), function(rw) { rw.addEventListener('click', function(ce) { ce.stopPropagation(); cMenu.style.display = 'none'; gmFightDo(am, gmF, rw.dataset.fight); }); });
            Array.prototype.forEach.call(cMenu.querySelectorAll('.cm-gm-loot'), function(rw) { rw.addEventListener('click', function(ce) { ce.stopPropagation(); cMenu.style.display = 'none'; gmLootDo(gmL); }); });   /* backlog 42, fold 3: Can be looted */
            Array.prototype.forEach.call(cMenu.querySelectorAll('.cm-gm-rules'), function(rw) { rw.addEventListener('click', function(ce) { ce.stopPropagation(); cMenu.style.display = 'none'; gmRulesDo(gmR); }); });   // 152 fold 4b
            groupRollWire(cMenu, grpM);   // 1.6.0 (v2, B7a)

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
            if (typeof action === 'string' && isWb && action.includes('cm-structure')) { cMenu.style.display = 'none'; var srow = structRow(am); if (srow) { var sw = structDo(am, srow.lock); if (sw) toast(sw); } return; }   // 231: the whole map's structure
            if (typeof action === 'string' && action.includes('cm-props')) { cMenu.style.display = 'none'; if (window.wpOpenRightPanel) window.wpOpenRightPanel(); return; }   // 1.6.2 (backlog 229): the piece, or on the Data Map the room, the right-click selected

            if (typeof action === 'string' && (action.includes('cm-opacity') || action.includes('cm-align-row') || action.includes('align-btn') || action.includes('cm-stance') || action.includes('cm-stackrows'))) return; // control rows keep the menu open
            if (typeof action === 'string' && action.includes('cm-order')) { var stk = cMenu.querySelector('.cm-stackrows'); if (stk) { stk.hidden = !stk.hidden; ce.target.setAttribute('aria-expanded', stk.hidden ? 'false' : 'true'); ce.target.innerHTML = 'Order ' + (stk.hidden ? '&#9656;' : '&#9662;'); placeMenu(cMenu); } return; }   // 1.6.2: Order opens its four rows and keeps the menu up
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
                } else if (action.includes('cm-scene-show')) {   // backlog 181: a scene of this picture
                    cMenu.style.display = 'none';
                    var itSc = am.whiteboard.find(function(x) { return x.id === selectedIds[0]; }), scSrc = sceneSrcOf(itSc);
                    if (scSrc && window.wpScene) window.wpScene.open(scSrc, { title: itSc.isChar && typeof itSc.name === 'string' ? itSc.name : '' });
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
                    if (itDm && itDm.charId && window.wpSheets && window.wpSheets.takeDamage) window.wpSheets.takeDamage(itDm.charId, { tok: itDm.id });   // 1.6.3 (finding 4): the token the blow is for, which may take its own sheet first where its sheet is shared
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
                } else if (action.includes('cm-trk-hide')) {   // backlog 29: keep the table trackers from this token's player, or stop
                    var itTH = am.whiteboard.find(function(x) { return x.id === selectedIds[0]; });
                    cMenu.style.display = 'none';
                    if (itTH && itTH.ownerId && window.wpTrackers && window.wpTrackers.setHidden(itTH.ownerId, !window.wpTrackers.hidden(itTH.ownerId))) toast(window.wpTrackers.hidden(itTH.ownerId) ? 'Table trackers hidden from this player.' : 'This player sees the table\u2019s trackers again.');
                    return;
                } else if (action.includes('cm-own-sheet')) {   // 1.6.2 (backlog 237): one save, one Undo step on this map
                    cMenu.style.display = 'none';
                    if (window.wpSheets && window.wpSheets.ownSheetFor) window.wpSheets.ownSheetFor(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }).filter(Boolean));
                    return;
                } else if (action.includes('cm-encounter-save')) {   // backlog 31
                    groupSave(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }).filter(Boolean));
                } else if (action.includes('cm-cast-save')) {
                    castSave(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }).filter(Boolean));
                    return;
                } else if (action.includes('cm-dup')) {
                    duplicateWbItems(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }).filter(Boolean));
                    return;   // saved + rendered inside
                } else if (action.includes('cm-fog-hide') || action.includes('cm-fog-show')) {   // a piece's fog mark (saved and drawn again below, so the table gets it at once)
                    var wentFH = fogHandSet(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }), action.includes('cm-fog-hide') ? 'hide' : 'show');
                    if (wentFH) { if (window.wpFog) { window.wpFog.invalidateVision(); window.wpFog.redraw(); } var noteFH = wentFH !== 'off' && window.wpFog && typeof window.wpFog.handNote === 'function' ? window.wpFog.handNote(am) : ''; toast((wentFH === 'hide' ? 'Under fog: players see nothing under it.' : wentFH === 'show' ? 'Always revealed: players always see what is under it.' : 'Fog mark taken off.') + (noteFH ? ' ' + noteFH : '')); }
                } else if (action.includes('cm-toshow')) {   // 1.6.2: a drawing to show, ticked or unticked (saved and drawn again below, so the table gets it at once)
                    var wentSw = showRowDo(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }), am);
                    if (wentSw) toast(wentSw === 'show' ? 'Everyone on this map sees it over the fog now.' : 'It is on the map now, under the fog.');
                } else if (action.includes('cm-door-open') || action.includes('cm-door-lock')) {   // a door's own rows (saved and drawn again below): an open door lets sight through, so the fog works its vision out again
                    var wentD = doorRowsDo(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }), action.includes('cm-door-open') ? 'open' : 'lock');
                    if (wentD) { if (window.wpFog) { window.wpFog.invalidateVision(); window.wpFog.redraw(); } toast(wentD === 'opened' ? 'Door opened.' : wentD === 'closed' ? 'Door closed.' : wentD === 'locked' ? 'Door locked for players.' : 'Door unlocked for players.'); }
                    if (wentD === 'opened') { var tallyD = { hid: 0 }, saidD = secretOpenedWords(secretOpened(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }), tallyD), tallyD.hid); if (saidD) toast(saidD); }   // a secret door that is opened is found: an open door cannot be secret
                } else if (action.includes('cm-hazard-roll')) {   // 1.6.2: a map hazard's roll, a card to each character standing in it
                    var hzN = hazardRoll(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }), am); toast(hzN ? (hzN === 1 ? 'One card sent.' : hzN + ' cards sent.') : 'Nobody standing in it.');
                } else if (action.includes('cm-hazard-spread')) {   // 1.6.2: fire that spreads, one cell outward (saved and drawn again below)
                    var hzS = hazardSpread(am); toast(hzS ? 'The fire spread to ' + hzS + ' cell' + (hzS === 1 ? '' : 's') + '.' : 'Nowhere left for it to spread.');
                } else if (action.includes('cm-secret-show') || action.includes('cm-secret-make')) {   // the map builder: a secret door revealed, or a door made secret (saved and drawn again below, so the table gets it at once)
                    var wentS = secretRowDo(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }));
                    if (wentS) { if (window.wpFog) { window.wpFog.invalidateVision(); window.wpFog.redraw(); } toast(wentS === 'shown' ? 'Secret door revealed. Your players see it as a door now.' : 'Secret door. Your players see wall here until it is found.'); }
                } else if (action.includes('cm-open-page')) {   // 1.5.4 (pageshelf.js): a pin's page, opened by the one rule (over the map by a plain click)
                    var ppDo = pagePinRow(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }));
                    if (ppDo && window.wpPageShelf) { if (ppDo.at) window.wpPageShelf.open(ppDo.id, window.wpPageShelf.wayNow(ce), { at: ppDo.at }); else window.wpPageShelf.open(ppDo.id, window.wpPageShelf.wayNow(ce)); }   // 1.6.0: at the part the pin names
                } else if (action.includes('cm-mine-off')) {   // 1.5.8 explosives: each selected mine goes off at its center (it saves and draws itself)
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
                } else if (action.includes('cm-flatten')) {   // 1.6.2 (backlog 39): the map picture's dialog, flattening the selection
                    if (window.wpMapShot && window.wpMapShot.flatten) window.wpMapShot.flatten(selectedIds.slice());
                } else if (action.includes('cm-unflat')) {
                    if (window.wpFlatten && selectedIds.length === 1) window.wpFlatten.undo(am, selectedIds[0]);
                } else if (action.includes('cm-box-open')) {   // 1.6.2 (backlog 42): what this container holds
                    if (selectedIds.length === 1 && window.wpBoxes) window.wpBoxes.open(selectedIds[0]);
                } else if (action.includes('cm-room-show')) {   // 1.6.2 (backlog 45, fold 3): the piece's room on the Data Map
                    var rsSaid = selectedIds.length === 1 && window.wpRoomShowData ? window.wpRoomShowData(selectedIds[0]) : ''; if (rsSaid) toast(rsSaid);
                } else if (action.includes('cm-room-make')) {   // 1.6.2 (backlog 45): a room on the Data Map for the one piece selected (saved and drawn again below: one Undo takes both back), its name ready to type in Properties
                    var rmW = selectedIds.length === 1 ? am.whiteboard.find(function(x) { return x.id === selectedIds[0]; }) : null, rmDo = rmW ? pieceRoomMake(am, rmW) : null;
                    if (rmDo) { toast(rmW.hidden ? 'Room made and linked. Players are sent room names, so give it one they may know.' : 'Room made and linked: ' + rmDo.name + '. Type its name in Properties.'); if (window.wpOpenRightPanel) window.wpOpenRightPanel(); setTimeout(function() { var fN = document.getElementById('fName'); if (fN && typeof fN.focus === 'function') { fN.focus(); if (typeof fN.select === 'function') fN.select(); } }, 0); }
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
                    // 1.6.3 (findings 15 and 16): delask.js asks first where the selection holds a locked piece, a token or a flattened picture's
                    // pieces; the menu goes at once, and the save and the draw come once the pieces have gone (a waiting token stays away, F1a)
                    cMenu.style.display = 'none';
                    delWb(am, selectedIds.slice(), showConfirm, function(out) { state.selWbIds = []; state.selWbId = null; save(); if (window.appRender) window.appRender(); toast(delSaid(out)); }, getActiveMap);
                    return;
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
                    // 1.6.3 (finding 15): a room takes its links with it, so the Data Map asks first (delask.js). The links went with the room
                    // only from the Delete key before; every way of deleting a room now takes them
                    cMenu.style.display = 'none';
                    delRooms(am, selectedIds.slice(), showConfirm, function() { state.selId = null; save(); if (window.appRender) window.appRender(); toast('Room deleted.'); }, getActiveMap);
                    return;
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






