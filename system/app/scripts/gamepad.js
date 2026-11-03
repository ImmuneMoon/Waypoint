/* Waypoint's controller (1.6.2, backlog 202, fold 2; the owner, 2026-11-02, by prompt: a controller moves, turns, picks the next token and
   ends a turn, with "full controller support" and every binding the player's own). A controller in the standard layout is read through
   the Gamepad API every 16 ms while one is connected. The D-pad and the left stick move the selection a step, again and again while held,
   through io.js's own step (wpNudge); every other button runs its command as its key does (wpCommands.run). Nothing runs where a key would
   not (wpCommands.heldNow: a box being typed in, a window, a question, the tour, the stream window), and a button held while that is so
   runs nothing until it is let go. A button is the player's to set in Settings, under Keys, beside the key, and is kept on this computer
   (wp_pad: { command id: a button's number, or -1 for none }). Logged as "pad v1": what connected, what ran and what was set, never a name.
   Published as window.wpPad. */
import { toast } from './io.js';

// [shelfcheck:pad-start]
// What a controller does: the commands it may run, each with its button in the standard layout (the D-pad moves, the bumpers turn, A picks
// the next token, Y ends a turn), the buttons' names, and the moves' directions. The stick always moves, whatever the buttons are set to
var PAD_IDS = ['token.up', 'token.down', 'token.left', 'token.right', 'token.turnLeft', 'token.turnRight', 'token.next', 'turn.end'];
var PAD_DEF = { 'token.up': 12, 'token.down': 13, 'token.left': 14, 'token.right': 15, 'token.turnLeft': 4, 'token.turnRight': 5, 'token.next': 0, 'turn.end': 3 };
var PAD_WORDS = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'Left stick press', 'Right stick press', 'D-pad up', 'D-pad down', 'D-pad left', 'D-pad right', 'Home'];
var PAD_MOVE = { 'token.up': [0, -1], 'token.down': [0, 1], 'token.left': [-1, 0], 'token.right': [1, 0] };
var REPEAT_FIRST = 400, REPEAT_EVERY = 180, STICK = 0.55, PAD_EVERY = 16;
// A button's name, or '' for no button of the standard layout
function padWord(b) { return typeof b === 'number' && Math.floor(b) === b && b >= 0 && b < PAD_WORDS.length ? PAD_WORDS[b] : ''; }
// This computer's choice as kept: { command id: a button, or -1 for none }, of the commands a controller runs
function padsClean(v) {
    var out = {}; if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
    PAD_IDS.forEach(function(id) { if (!Object.prototype.hasOwnProperty.call(v, id)) return; var b = v[id]; if (b === -1 || padWord(b)) out[id] = b; });
    return out;
}
// Each command's button now: this computer's choice first, then its default where no choice holds that button; -1 for none
function padsNow(mine) {
    var m = padsClean(mine), out = {}, used = {};
    PAD_IDS.forEach(function(id) { if (!Object.prototype.hasOwnProperty.call(m, id)) return; var b = m[id]; out[id] = b >= 0 && !used[b] ? b : -1; if (out[id] >= 0) used[b] = 1; });
    PAD_IDS.forEach(function(id) { if (Object.prototype.hasOwnProperty.call(out, id)) return; var d = PAD_DEF[id]; out[id] = used[d] ? -1 : d; if (out[id] >= 0) used[d] = 1; });
    return out;
}
// The command a button runs now, or ''
function padAt(binds, b) { for (var i = 0; i < PAD_IDS.length; i++) if (binds[PAD_IDS[i]] === b) return PAD_IDS[i]; return ''; }
// One frame: the buttons down ({ number: true }), the left stick ([x, y] or null), the time, and what was held before ({ id: { since, last } }).
// A command runs as its button goes down; a move runs again while held, after REPEAT_FIRST and then each REPEAT_EVERY. Answers { fire, held }
function padStep(binds, down, stick, t, held) {
    var now = {}, fire = [], nh = {}, d = down || {};
    PAD_IDS.forEach(function(id) { var b = binds ? binds[id] : -1; if (typeof b === 'number' && b >= 0 && d[b] === true) now[id] = 1; });
    if (stick && typeof stick[0] === 'number' && typeof stick[1] === 'number') {
        if (stick[1] < -STICK) now['token.up'] = 1; if (stick[1] > STICK) now['token.down'] = 1; if (stick[0] < -STICK) now['token.left'] = 1; if (stick[0] > STICK) now['token.right'] = 1;
    }
    Object.keys(now).forEach(function(id) {
        var h = held && Object.prototype.hasOwnProperty.call(held, id) ? held[id] : null;
        if (!h) { fire.push(id); nh[id] = { since: t, last: t }; return; }
        nh[id] = h;
        if (PAD_MOVE[id] && t - h.since >= REPEAT_FIRST && t - h.last >= REPEAT_EVERY) { fire.push(id); nh[id] = { since: h.since, last: t }; }
    });
    return { fire: fire, held: nh };
}
// What Settings says of the controllers connected (the owner, 2026-11-03: "the controller compatibility should include info about the controller
// connected"): a line each, its name as the browser gives it with the maker's numbers taken off, how many buttons it has, and whether its layout
// is the standard one, whose names Settings uses. With none, how to make one show: a browser names a controller only after one of its buttons is pressed
function padName(id) {
    var s = String(typeof id === 'string' ? id : '').replace(/[\u0000-\u001f\u007f]/g, ' ');
    s = s.replace(/\s*\([^)]*vendor[^)]*\)\s*/ig, ' ').replace(/^\s*[0-9a-f]{1,4}-[0-9a-f]{1,4}-/i, '').replace(/\s+/g, ' ').trim();
    return s.slice(0, 80) || 'A controller';
}
function padAbout(pads) {
    var out = [];
    (pads && typeof pads === 'object' && typeof pads.length === 'number' ? Array.prototype.slice.call(pads, 0, 8) : []).forEach(function(g) {
        if (!g || typeof g !== 'object' || g.connected === false) return;
        var n = g.buttons && typeof g.buttons.length === 'number' ? g.buttons.length : 0;
        out.push('Connected: ' + padName(g.id) + ', ' + n + (n === 1 ? ' button' : ' buttons') + '. ' + (g.mapping === 'standard' ? 'It uses the standard layout, so its buttons are the ones named here.' : 'Its layout is not the standard one, so a button may not be the one its name says here.'));
    });
    if (!out.length) out.push('No controller is connected. Plug one in and press any of its buttons: the browser shows a controller only after a press.');
    return out;
}
// [shelfcheck:pad-end]

function padLog(step, f) { try { if (typeof window.wpStepLog === 'function') window.wpStepLog('pad v1', step, f || {}); } catch (e) {} }
function padMine() { try { return padsClean(JSON.parse(localStorage.getItem('wp_pad') || '{}')); } catch (e) { return {}; } }
function padSave(m) { try { localStorage.setItem('wp_pad', JSON.stringify(m)); return true; } catch (e) { return false; } }
var _binds = padsNow(padMine()), _held = {}, _raf = 0, _pick = null, _was = {};
function padRead() {
    var pads = [], out = { any: false, down: {}, stick: null };
    try { pads = typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function' ? navigator.getGamepads() || [] : []; } catch (e) { pads = []; }
    for (var i = 0; i < pads.length; i++) {
        var g = pads[i]; if (!g || g.connected === false) continue; out.any = true;
        (g.buttons || []).forEach(function(b, k) { if (b && (b.pressed === true || b.value > 0.5)) out.down[k] = true; });
        if (!out.stick && g.axes && g.axes.length >= 2) out.stick = [g.axes[0], g.axes[1]];
    }
    return out;
}
function padFire(id) {
    if (PAD_MOVE[id]) { if (typeof window.wpNudge === 'function') window.wpNudge(PAD_MOVE[id], false); return; }
    var C = window.wpCommands; if (!C || typeof C.run !== 'function') return;
    var r = C.run(id, 'pad'); if (r !== true && typeof r === 'string') toast(r);
}
function padPicked(b) {
    var p = _pick; _pick = null; if (!p) return;
    var mine = padMine(), took = padAt(_binds, b); if (took === p.id) took = '';
    mine[p.id] = b; if (took) mine[took] = -1;
    var ok = padSave(mine); _binds = padsNow(padMine());
    padLog(ok ? 'pad-set' : 'pad-save-failed', { id: p.id, button: b });
    if (typeof p.done === 'function') p.done(ok ? p.name + ' is ' + padWord(b) + ' on the controller now.' + (took ? ' ' + (p.names[took] || 'Another command') + ' had it and has none now.' : '') : 'The button could not be kept on this computer.');
}
function padTick(t) {
    _raf = 0; var r = padRead(); if (!r.any) { _held = {}; return; }
    if (_pick) {
        if (t - _pick.at > 10000) { var p = _pick; _pick = null; if (typeof p.done === 'function') p.done('No button was pressed, so nothing changed.'); }
        else { var b = Object.keys(r.down).map(Number).filter(function(k) { return !_was[k]; })[0]; if (b !== undefined && padWord(b)) padPicked(b); }
        _was = r.down; _held = padStep(_binds, r.down, r.stick, t, {}).held; _raf = setTimeout(padNext, PAD_EVERY); return;
    }
    _was = r.down;
    var C = window.wpCommands, why = C && typeof C.heldNow === 'function' ? C.heldNow() : 'none';
    var st = padStep(_binds, r.down, r.stick, t, _held); _held = st.held;
    if (!why) st.fire.forEach(function(id) { padFire(id); });   // while a key would run nothing, what is pressed is only noted, so it runs nothing until let go
    _raf = setTimeout(padNext, PAD_EVERY);
}
function padPads() { try { return typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function' ? navigator.getGamepads() || [] : []; } catch (e) { return []; } }
// Settings' controller line, drawn as text, a line a controller
function padInfoDraw(doc) {
    var d = doc || (typeof document !== 'undefined' ? document : null), box = d ? d.getElementById('setPadInfo') : null; if (!box) return false;
    while (box.firstChild) box.removeChild(box.firstChild);
    padAbout(padPads()).forEach(function(w, i) { if (i) box.appendChild(d.createElement('br')); box.appendChild(d.createTextNode(w)); });
    return true;
}
function padNow() { return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now(); }
function padNext() { padTick(padNow()); }
function padWake() { if (!_raf) _raf = setTimeout(padNext, PAD_EVERY); }   // a timer, never a frame: a window that is not being painted runs no frame
if (typeof window !== 'undefined') {
    window.addEventListener('gamepadconnected', function(e) { padLog('connect', { n: e && e.gamepad && typeof e.gamepad.index === 'number' ? e.gamepad.index : -1, standard: !!(e && e.gamepad && e.gamepad.mapping === 'standard') }); padInfoDraw(); padWake(); });
    window.addEventListener('gamepaddisconnected', function() { padLog('disconnect', {}); setTimeout(function() { padInfoDraw(); }, 0); });   // the browser's list drops it once this event is over
    padWake();
    window.wpPad = {
        ids: PAD_IDS.slice(), word: function(id) { return padWord(_binds[id]); }, has: function(id) { return PAD_IDS.indexOf(id) >= 0; },
        // Settings, Keys: wait for the next button pressed (10 s at most) for one command; a second ask for the same command lets the wait go
        pick: function(id, name, names, done) {
            if (PAD_IDS.indexOf(id) < 0) return false;
            if (_pick && _pick.id === id) { _pick = null; if (typeof done === 'function') done('No button was changed.'); return false; }
            _pick = { id: id, name: name || id, names: names || {}, done: done, at: padNow() }; _was = padRead().down; padWake();
            return true;
        },
        picking: function(id) { return !!_pick && (id === undefined || _pick.id === id); },
        off: function(id) { if (PAD_IDS.indexOf(id) < 0) return false; var m = padMine(); m[id] = -1; var ok = padSave(m); _binds = padsNow(padMine()); padLog(ok ? 'pad-off' : 'pad-save-failed', { id: id }); return ok; },
        reset: function() { try { localStorage.removeItem('wp_pad'); } catch (e) {} _binds = padsNow({}); padLog('pad-reset', {}); },
        reload: function() { _binds = padsNow(padMine()); },   // a profile opened here brought its buttons
        connected: function() { return padRead().any; },
        about: function() { return padAbout(padPads()); }, info: padInfoDraw   // Settings, Keys: what is connected
    };
}
export { PAD_IDS, PAD_DEF, padWord, padsClean, padsNow, padAt, padStep, padName, padAbout };
