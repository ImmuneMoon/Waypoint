/* Waypoint's mouse (1.6.2; the owner, 2026-11-05: "lets add mapping for mouse clicks and controls too", by prompt "Commands and the map's
   gestures (Recommended)", "Yes, like keys (Recommended)", "A short list each (Recommended)" and "Side buttons anywhere (Recommended)").
   Pure: what a mouse press is called, what the map's own gestures may be, what this computer keeps, and why a press may not run a command.
   A press is named as a key is, its keys held first: Ctrl, Alt, Shift, then the button (Left, Right, Middle, Back, Forward). A plain left
   or right click stays the map's own, and so does a click the map reads (Ctrl or Shift with the left button adds to the selection, the
   ping's own click, and the middle button while it pans). Back and Forward run their command anywhere in the window; any other press only
   on the map. mousemap.js (window.wpMouse) wires it, settings draw it, and a profile carries it (wp_mouse). */

// [mousecheck:core-start]
var BUTTONS = ['Left', 'Middle', 'Right', 'Back', 'Forward'];   // by the browser's own number: 0 to 4
var BUTTON_WORDS = { Left: 'click', Middle: 'middle click', Right: 'right click', Back: 'Back button', Forward: 'Forward button' };
var MOUSE_RE = /^(Ctrl\+)?(Alt\+)?(Shift\+)?(Left|Middle|Right|Back|Forward)$/;
// The map's own gestures, each a short list, the first what it does as it comes (the owner: "A short list each")
var GESTURES = {
    pan: [['middle', 'Middle drag'], ['right', 'Right drag'], ['off', 'Off']],
    zoom: [['wheel', 'Wheel'], ['ctrl', 'Ctrl + wheel']],
    ping: [['alt', 'Alt + click'], ['ctrlalt', 'Ctrl + Alt + click']],
    open: [['dbl', 'Double-click'], ['shiftdbl', 'Shift + double-click']]
};
var GESTURE_IDS = ['pan', 'zoom', 'ping', 'open'];
// A press as a name, or '' for a button that has none
function mouseOf(e) {
    if (!e || typeof e.button !== 'number') return '';
    var b = BUTTONS[e.button]; if (!b) return '';
    return (e.ctrlKey || e.metaKey ? 'Ctrl+' : '') + (e.altKey ? 'Alt+' : '') + (e.shiftKey ? 'Shift+' : '') + b;
}
// A press in words: "Ctrl + middle click", "Back button"
function mouseName(n) {
    if (typeof n !== 'string' || !MOUSE_RE.test(n)) return '';
    var parts = n.split('+'), b = parts.pop();
    var w = parts.concat([BUTTON_WORDS[b]]).join(' + '); return w.charAt(0).toUpperCase() + w.slice(1);
}
function sideButton(n) { return n === 'Back' || n === 'Forward' || /\+(Back|Forward)$/.test(n); }
// This computer's choices as kept: { cmds: { command id: a press, or '' for none }, pan, zoom, ping, open }, each gesture only as a word of its list
function mouseClean(v, ids) {
    var out = { cmds: {} }, ok = Array.isArray(ids) ? ids : null;
    if (!v || typeof v !== 'object' || Array.isArray(v)) v = {};
    var c = v.cmds && typeof v.cmds === 'object' && !Array.isArray(v.cmds) ? v.cmds : {};
    Object.keys(c).slice(0, 64).forEach(function(id) {
        if (id in Object.prototype || id.length > 40 || !/^[a-z]+(\.[A-Za-z]+)+$/.test(id) || (ok && ok.indexOf(id) < 0)) return;
        var p = c[id]; if (p === '' || (typeof p === 'string' && MOUSE_RE.test(p))) out.cmds[id] = p;
    });
    GESTURE_IDS.forEach(function(g) { var w = v[g]; if (typeof w === 'string' && GESTURES[g].some(function(o) { return o[0] === w; }) && w !== GESTURES[g][0][0]) out[g] = w; });
    return out;
}
// A gesture as it is now: the kept word, else the first of its list
function gestureOf(m, g) { var w = m && typeof m === 'object' ? m[g] : null; return GESTURES[g] && typeof w === 'string' && GESTURES[g].some(function(o) { return o[0] === w; }) ? w : (GESTURES[g] ? GESTURES[g][0][0] : ''); }
function gestureWords(g, w) { var o = (GESTURES[g] || []).filter(function(x) { return x[0] === w; })[0]; return o ? o[1] : ''; }
// What the map does with a press now, as words, or '': a plain click, a right click, a selection, the ping's click, a middle press that pans
function mapTakes(n, m) {
    if (typeof n !== 'string' || !MOUSE_RE.test(n)) return 'That is no mouse press.';
    if (n === 'Left') return 'A plain click stays the map’s own.';
    if (n === 'Right') return 'A right click opens the map’s menu.';
    var ping = gestureOf(m, 'ping'); if ((ping === 'alt' && n === 'Alt+Left') || (ping === 'ctrlalt' && n === 'Ctrl+Alt+Left')) return mouseName(n) + ' pings a spot on the map.';
    if (/Left$/.test(n) && /(^|\+)(Ctrl|Shift)\+/.test(n)) return mouseName(n) + ' adds to the selection on the map.';
    var pan = gestureOf(m, 'pan'); if ((pan === 'middle' && n === 'Middle') || (pan === 'right' && n === 'Right')) return mouseName(n) + ' pans the map. Pick another, or change Pan the map below.';
    return '';
}
// The command a press runs now, or ''
function mouseAt(cmds, n) { var ks = Object.keys(cmds || {}); for (var i = 0; i < ks.length; i++) if (cmds[ks[i]] === n) return ks[i]; return ''; }
// Where a press runs: the side buttons anywhere in the window, any other press on the map alone (the owner: "Side buttons anywhere")
function mouseWhere(n) { return sideButton(n) ? 'anywhere' : 'map'; }
// [mousecheck:core-end]

export { BUTTONS, GESTURES, GESTURE_IDS, MOUSE_RE, mouseOf, mouseName, sideButton, mouseClean, gestureOf, gestureWords, mapTakes, mouseAt, mouseWhere };
