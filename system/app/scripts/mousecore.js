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
    open: [['dbl', 'Double-click'], ['shiftdbl', 'Shift + double-click']],
    // 1.6.3 (Fulllion, 2026-11-19: a right click "by default brings up a open in new tab, or open in new window (inside waypoint), or open in
    // external window, able to be changed like any other control"): the presses on a link to a page, or a mention, where a page is read.
    // linkMenu opens the menu of where it may open; linkTab opens the page in a new tab of the page panel; linkWin in an external window (a
    // window of the system's own, which may go to a second screen); linkPanel in the page panel, the floating window inside Waypoint. A plain
    // click always follows the link where it stands. Each is one press of LINK_PRESSES below, and two never share one (linkClash)
    linkMenu: [['right', 'Right click'], ['shiftright', 'Shift + right click'], ['off', 'Off']],
    linkTab: [['middle', 'Middle click'], ['ctrl', 'Ctrl + click'], ['shift', 'Shift + click'], ['alt', 'Alt + click'], ['ctrlshift', 'Ctrl + Shift + click'], ['off', 'Off']],
    linkWin: [['ctrl', 'Ctrl + click'], ['middle', 'Middle click'], ['shift', 'Shift + click'], ['alt', 'Alt + click'], ['ctrlshift', 'Ctrl + Shift + click'], ['off', 'Off']],
    linkPanel: [['shift', 'Shift + click'], ['middle', 'Middle click'], ['ctrl', 'Ctrl + click'], ['alt', 'Alt + click'], ['ctrlshift', 'Ctrl + Shift + click'], ['off', 'Off']]
};
var GESTURE_IDS = ['pan', 'zoom', 'ping', 'open', 'linkMenu', 'linkTab', 'linkWin', 'linkPanel'];
// 1.6.3: each word a link gesture may take, as the button the browser numbers (0 the left, 1 the middle, 2 the right) and the keys held with it
// (c Ctrl or the command key, a Alt, s Shift, in that order). LINK_WAYS says what each link gesture does, in the order a press is judged
var LINK_PRESSES = { right: [2, ''], shiftright: [2, 's'], middle: [1, ''], ctrl: [0, 'c'], shift: [0, 's'], alt: [0, 'a'], ctrlshift: [0, 'cs'] };
var LINK_WAYS = [['linkMenu', 'menu'], ['linkTab', 'tab'], ['linkWin', 'window'], ['linkPanel', 'panel']];
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
    // 1.6.3, the review of links: two link gestures never share one press, however they were kept. Settings never lets them (linkClash), but a
    // profile pack or a wp_mouse from another computer may name one press twice (linkTab: 'ctrl' beside linkWin left at its own Ctrl + click), and
    // then Settings showed both rows as that press while linkPress let only the first do anything. So the clash is settled here, once, in
    // LINK_WAYS order, the same order linkPress judges a press in: a later gesture whose press an earlier one already holds is turned Off.
    // What a gesture holds is read through gestureOf on what is kept so far, so a gesture left at its default (kept as nothing) counts too.
    // Settings, the link menu's gray words and linkPress all read the cleaned record, so they agree
    var held = {};
    LINK_WAYS.forEach(function(x) {
        var g = x[0], w = gestureOf(out, g); if (w === 'off' || !LINK_PRESSES[w]) return;
        if (held[w]) out[g] = 'off'; else held[w] = g;
    });
    var kept = { cmds: out.cmds };   // in GESTURE_IDS order whatever was turned Off, so the same choices are always kept as the same text
    GESTURE_IDS.forEach(function(g) { if (g in out) kept[g] = out[g]; });
    return kept;
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
// 1.6.3: what a press on a link does now, by this computer's link gestures: 'menu', 'tab', 'window', 'panel', or '' where no link gesture names
// it (a plain click, which follows the link where it stands, or a press nobody picked). linkgate.js asks it at a click, the middle button and the
// right button alike. The keys must be exactly those of the word: Ctrl + Shift + click is never read as Ctrl + click
function linkKeys(e) { return (e.ctrlKey || e.metaKey ? 'c' : '') + (e.altKey ? 'a' : '') + (e.shiftKey ? 's' : ''); }
function linkPress(e, m) {
    if (!e || typeof e.button !== 'number') return '';
    var k = linkKeys(e);
    for (var i = 0; i < LINK_WAYS.length; i++) {
        var w = gestureOf(m, LINK_WAYS[i][0]), p = LINK_PRESSES[w];
        if (p && p[0] === e.button && p[1] === k) return LINK_WAYS[i][1];
    }
    return '';
}
// 1.6.3: the other link gesture that holds this press now, or '': picking a press another link gesture has takes it from that one (mousemap.js
// setGesture turns it Off), as picking a key another command holds takes it. Off clashes with nothing, and a map gesture (pan, zoom, ping,
// open) clashes with no link gesture, since the map's presses and a link's never stand on the same element
function linkClash(m, g, w) {
    if (w === 'off' || !LINK_PRESSES[w] || !LINK_WAYS.some(function(x) { return x[0] === g; })) return '';
    for (var i = 0; i < LINK_WAYS.length; i++) { var h = LINK_WAYS[i][0]; if (h !== g && gestureOf(m, h) === w) return h; }
    return '';
}
// The command a press runs now, or ''
function mouseAt(cmds, n) { var ks = Object.keys(cmds || {}); for (var i = 0; i < ks.length; i++) if (cmds[ks[i]] === n) return ks[i]; return ''; }
// Where a press runs: the side buttons anywhere in the window, any other press on the map alone (the owner: "Side buttons anywhere")
function mouseWhere(n) { return sideButton(n) ? 'anywhere' : 'map'; }
// [mousecheck:core-end]

export { BUTTONS, GESTURES, GESTURE_IDS, MOUSE_RE, mouseOf, mouseName, sideButton, mouseClean, gestureOf, gestureWords, mapTakes, mouseAt, mouseWhere, LINK_PRESSES, LINK_WAYS, linkPress, linkClash };
