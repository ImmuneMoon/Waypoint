/* See as selected (1.6.4; Fulllion, 2026-11-24: "have the board show exactly what only a chosen npc sees only ... to give the impression of
   piloting the npc and a visual change to their perspective", "when controlling an npc"; by prompt: "A switch, then select", what shows "each,
   as an option", the camera "follow it as you control its movement, as an option, and the first two as options, with the ability to move the
   camera around like usual easily when needed").

   The GM turns See as selected on from the View menu (or a key of their own in Settings, Keys). While it is on, the play map on the GM's screen
   is drawn from the eyes of the ONE character token last selected: select another and the view switches to it at once. Selecting several
   pieces, or none, keeps the token it is on.

   - The fog: fog.js draws its standpoint '*tok:' and the token's id (its TOK_SEE), so the token's own sight, light, senses, arc and marks are
     read exactly as the fog reads any token's, with its sheet read as the GM reads it. Solid (the default) draws the fog as a player's screen
     does and takes off the board every creature that token cannot see; See-through draws its sight under the GM's usual see-through veil and
     leaves every creature in view.
   - The camera: Follow keeps the token in the middle as it moves (a drag is let go first), Center once moves the view to it when it is picked,
     Stay leaves the view alone. The view may be panned and zoomed as ever: following picks up again at the token's next move.

   It is the GM's screen alone: nothing is stored on the map, nothing is sent, and a player's screen and the stream window never run it. A
   noticing check it would need is judged quietly (fog.js seeQuiet), so looking never rolls one. Which way the fog and the camera go is kept
   on this computer (wp_seeAs); the switch itself is not, so the app always opens as the GM's own view. */
import { state } from './state.js';

// [fogcheck:seeas-start]
var SEE_KEY = 'wp_seeAs', SEE_FOG = ['solid', 'see'], SEE_CAM = ['follow', 'once', 'stay'], SEE_TICK_MS = 200, SEE_DRAG_MS = 15000, SEE_DROP_MS = 1000;
// What this computer keeps, read as data: { fog, cam }, each one of its own words, else the first
function seeOpts(raw) {
    var o = null; try { o = JSON.parse(raw); } catch (e) { o = null; }
    var fog = o && typeof o === 'object' && SEE_FOG.indexOf(o.fog) >= 0 ? o.fog : SEE_FOG[0], cam = o && typeof o === 'object' && SEE_CAM.indexOf(o.cam) >= 0 ? o.cam : SEE_CAM[0];
    return { fog: fog, cam: cam };
}
// The token a selection picks: the ONE character token selected on the map (a waiting token and anything else picks nothing). sel: the ids
// selected; map: the map on screen. Answers its id, or '' where the selection picks none, and the token it is on then stays
function seePick(sel, map) {
    if (!Array.isArray(sel) || sel.length !== 1 || !map || !Array.isArray(map.whiteboard)) return '';
    for (var i = 0; i < map.whiteboard.length; i++) { var w = map.whiteboard[i]; if (w && w.id === sel[0]) return w.isChar && !w.waiting && typeof w.id === 'string' ? w.id : ''; }
    return '';
}
// The token's middle on the board, or null where it is no longer a character token of this map
function seeTokOf(map, id) {
    if (!map || !Array.isArray(map.whiteboard) || typeof id !== 'string' || !id) return null;
    for (var i = 0; i < map.whiteboard.length; i++) { var w = map.whiteboard[i]; if (w && w.id === id) return w.isChar && !w.waiting ? w : null; }
    return null;
}
function seeMid(w) { var x = +w.x, y = +w.y; if (!isFinite(x) || !isFinite(y)) return null; return { x: x + (+w.w || 60) / 2, y: y + (+w.h || 52) / 2 }; }
// The name a token goes by, as text: its own, else its sheet's, else plain words
function seeName(w) { var n = w && typeof w.name === 'string' && w.name.trim() ? w.name : w && typeof w.charName === 'string' && w.charName.trim() ? w.charName : ''; n = String(n).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim(); return n ? n.slice(0, 60) : 'a character'; }
// Which pieces' elements the board puts away: the ids drop holds, each on or off as it differs. els: the board's pieces; drop: { id: 1 } or null
// What the board's hiding is kept by between looks: the standpoint, the map, its fog mode and how many hand-painted cells it holds, and every
// character token's place, turn and hidden mark. Anything else it reads (light, senses, a door) is caught by the one look a second
function seeSig(o, map) {
    var f = map && map.fog || {}, man = f.manual || {}, parts = [o, map ? map.id : '', f.mode || '', (man.adds || []).length, (man.cuts || []).length];
    ((map && map.whiteboard) || []).forEach(function(w) { if (w && (w.isChar || w.waiting)) parts.push(w.id + ':' + Math.round(+w.x || 0) + ',' + Math.round(+w.y || 0) + ',' + (+w.rot || 0) + (w.hidden ? 'h' : '')); });
    return parts.join('|');
}
function seeHide(els, drop) {
    var n = 0;
    for (var i = 0; i < els.length; i++) {
        var el = els[i], id = el.dataset ? el.dataset.id : '', want = !!(drop && id && drop[id] === 1);
        if (el.classList.contains('seeas-hid') !== want) { el.classList.toggle('seeas-hid', want); n++; }
    }
    return n;
}
// [fogcheck:seeas-end]

var _on = false, _tok = '', _mapId = '', _last = null, _timer = null, _opts = seeOpts(load()), _said = '', _drop = null, _dropSig = '', _dropAt = 0;   // _drop: the creatures last worked out as unseen, kept by seeSig
function load() { try { return localStorage.getItem(SEE_KEY); } catch (e) { return null; } }
function keep() { try { localStorage.setItem(SEE_KEY, JSON.stringify(_opts)); } catch (e) {} }
function camp() { var a = state.appState; return a && a.campaigns && a.campaigns[a.activeCampaignId] || null; }
function mapNow() { var c = camp(), it = c && c.items && c.items[c.activeItemId]; return it && it.type === 'map' ? it : null; }
// Whether this screen may see as a token: the GM's own screen, on the play map (never a player's app or the stream window)
function may() { var n = window.wpNet; if (window.wpStream) return false; if (n && (n.foreign || (n.active && n.role === 'client'))) return false; return state.viewMode === 'visual'; }   // a player's app, its link up or down, never runs it
function owner() { if (!_on || !_tok || !may()) return ''; var m = mapNow(); return m && m.id === _mapId && seeTokOf(m, _tok) ? '*tok:' + _tok : ''; }
function boardEls() { var b = document.getElementById('whiteboard'); return b ? b.querySelectorAll('.wb-item[data-id]') : []; }
function center(p) {
    var wrap = document.getElementById('whiteboardWrap'); if (!wrap || !p) return;
    if (window.wpView && typeof window.wpView.place === 'function') { window.wpView.place(wrap, p.x, p.y, wrap.clientWidth / 2, wrap.clientHeight / 2); return; }
    var z = state.zoomLevel || 1; wrap.scrollLeft = p.x * z - wrap.clientWidth / 2; wrap.scrollTop = p.y * z - wrap.clientHeight / 2;
}
function redrawFog() { if (window.wpFog && typeof window.wpFog.redraw === 'function') window.wpFog.redraw(); }
function pillsSync() { if (window.wpPills && typeof window.wpPills.sync === 'function') window.wpPills.sync(); }
// One look, five times a second while it is on: the token the selection picks, the camera, and what the board puts away
function tick() {
    var m = mapNow();
    if (!m || !may()) { seeHide(boardEls(), null); return; }
    if (m.id !== _mapId) { _mapId = m.id; if (!seeTokOf(m, _tok)) _tok = ''; _last = null; }   // another map: the token it was on stays only if it stands here
    var pick = seePick(state.selWbIds, m);
    if (pick && pick !== _tok) { _tok = pick; _last = null; var wp = seeTokOf(m, _tok); if (wp && _opts.cam !== 'stay') center(seeMid(wp)); _last = wp ? seeMid(wp) : null; redrawFog(); }
    var w = seeTokOf(m, _tok);
    if (!w) { if (_tok) { _tok = ''; redrawFog(); } }
    else if (_opts.cam === 'follow') {
        var p = seeMid(w), drag = window.wpBoardDragAt > 0 && Date.now() - window.wpBoardDragAt < SEE_DRAG_MS;   // a drag under way: datamap stamps each move and sets 0 at the release, so a pause with the button down still counts
        if (p && !drag && (!_last || Math.abs(p.x - _last.x) > 0.5 || Math.abs(p.y - _last.y) > 0.5)) { if (_last) center(p); _last = p; }
    }
    var o = owner(), F = window.wpFog, solid = !!o && _opts.fog === 'solid' && !!F && typeof F.seeDrop === 'function';
    if (solid) { var sig = seeSig(o, m), now = Date.now(); if (sig !== _dropSig || now - _dropAt >= SEE_DROP_MS) { _dropSig = sig; _dropAt = now; _drop = F.seeDrop(o, camp(), m); } }
    else { _dropSig = ''; _drop = null; }
    seeHide(boardEls(), solid ? _drop : null);
    var say = o ? seeName(w) : ''; if (say !== _said) { _said = say; pillsSync(); }   // the pill names the token, so it is drawn again when that changes
}
function set(on) {
    on = on === true; if (on === _on) return _on;
    _on = on; document.body.classList.toggle('seeas-on', on);
    if (on) { _mapId = ''; _tok = ''; _last = null; tick(); if (!_timer) _timer = setInterval(tick, SEE_TICK_MS); }
    else { if (_timer) { clearInterval(_timer); _timer = null; } _tok = ''; _last = null; seeHide(boardEls(), null); }
    sync(); redrawFog(); _said = ''; pillsSync();
    return _on;
}
function opt(k, v) { if (k === 'fog' && SEE_FOG.indexOf(v) >= 0) _opts.fog = v; else if (k === 'cam' && SEE_CAM.indexOf(v) >= 0) _opts.cam = v; else return; keep(); sync(); if (_on) { tick(); redrawFog(); } }
// The View menu's part, drawn from the state: the tick, and the two rows of choices shown while it is on
function sync() {
    var b = document.getElementById('wbSeeAsBtn'); if (b) { b.classList.toggle('on', _on); b.setAttribute('aria-checked', _on ? 'true' : 'false'); }
    var part = document.getElementById('wbSeeAsOpts'); if (part) part.hidden = !_on;
    document.querySelectorAll('#wbSeeAsOpts [data-see]').forEach(function(x) { var k = x.dataset.see, on = _opts[k] === x.dataset.v; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on ? 'true' : 'false'); });
}
function wire() {
    var b = document.getElementById('wbSeeAsBtn'); if (b) b.addEventListener('click', function(e) { e.stopPropagation(); set(!_on); });
    var part = document.getElementById('wbSeeAsOpts'); if (part) part.addEventListener('click', function(e) { var x = e.target && e.target.closest ? e.target.closest('[data-see]') : null; if (!x) return; e.stopPropagation(); opt(x.dataset.see, x.dataset.v); });
    sync();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
window.wpSeeAs = {
    on: function() { return _on; }, set: set, toggle: function() { return set(!_on); },
    owner: owner, solid: function() { return _opts.fog === 'solid'; },
    name: function() { var m = mapNow(), w = m ? seeTokOf(m, _tok) : null; return w ? seeName(w) : ''; },
    may: may,
};
