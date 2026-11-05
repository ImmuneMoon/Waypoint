/* Waypoint's mouse bindings (1.6.2; the owner, 2026-11-05: "lets add mapping for mouse clicks and controls too", by prompt "Commands and
   the map's gestures (Recommended)", "Yes, like keys (Recommended)", "A short list each (Recommended)" and "Side buttons anywhere
   (Recommended)"). A command may take a mouse press, beside its key and its controller button, in Settings under Keys; the Back and
   Forward buttons run it anywhere in the window, any other press only on the map, and never where a key would run nothing
   (wpCommands.heldNow). The map's own gestures (pan, zoom, ping, open a piece) each take one of a short list, read by the board through
   wpMouse.gesture. What this computer keeps is wp_mouse ({ cmds: { command id: a press, or '' }, pan, zoom, ping, open }), cleaned by
   mousecore as it is read; a profile carries it as it carries the keys. Logged as "mouse v1": what was set and what ran, never a name.
   Published as window.wpMouse. */
import { toast } from './io.js';
import { mouseOf, mouseName, sideButton, mouseClean, gestureOf, gestureWords, mapTakes, mouseAt, GESTURES, GESTURE_IDS } from './mousecore.js';

function mLog(step, f) { try { if (typeof window.wpStepLog === 'function') window.wpStepLog('mouse v1', step, f || {}); } catch (e) {} }
function mMine() { try { return mouseClean(JSON.parse(localStorage.getItem('wp_mouse') || '{}')); } catch (e) { return { cmds: {} }; } }
function mSave(m) { try { var c = mouseClean(m); if (!Object.keys(c.cmds).length) delete c.cmds; localStorage.setItem('wp_mouse', JSON.stringify(c)); return true; } catch (e) { return false; } }
var _m = mMine(), _pick = null, _ate = -1, _rdown = null;
function cmdOk(id) { var C = window.wpCommands, c = C && typeof C.byId === 'function' ? C.byId(id) : null; return !!c && !c.own; }   // a move is its key's alone: a click steps no token
// The board: the play map or the data map, never a control on it, a menu over it or a box being typed in
function onMap(t) {
    if (!t || typeof t.closest !== 'function') return false;
    if (!t.closest('#whiteboardWrap, #canvasWrap')) return false;
    return !t.closest('button, input, select, textarea, a[href], [contenteditable="true"], .context-menu, .shape-menu, .floating-toolbar, .wb-text-edit');
}
function eat(e) { e.preventDefault(); e.stopImmediatePropagation(); }
// A press: a pick waiting in Settings first, then a command's press
function onDown(e) {
    if (_pick) { pickPress(e); return; }
    if (e.button === 2) _rdown = { x: e.clientX, y: e.clientY, far: false };
    var n = mouseOf(e); if (!n || n === 'Left' || n === 'Right') return;
    var id = mouseAt(_m.cmds, n); if (!id || !cmdOk(id)) return;
    if (!sideButton(n) && !onMap(e.target)) return;
    var C = window.wpCommands; if (!C || typeof C.run !== 'function') return;
    var why = typeof C.heldNow === 'function' ? C.heldNow() : 'none'; if (why) { mLog('held', { id: id, why: why }); return; }
    eat(e); _ate = e.button;
    var r = C.run(id, 'mouse'); if (r !== true && typeof r === 'string') toast(r);
}
// What follows a press that ran a command, or one taken by a pick, goes no further: no menu, no click, no browser Back
function onAfter(e) { if (_ate < 0 || e.button !== _ate) return; eat(e); if (e.type === 'click' || e.type === 'auxclick' || e.type === 'contextmenu') _ate = -1; }
function onUp(e) { if (_ate >= 0 && e.button === _ate) { eat(e); if (_ate !== 2) setTimeout(function() { _ate = -1; }, 0); } }
// A right drag that panned opens no menu at its end; a right click that did not move still does
function onMove(e) { if (_rdown && !_rdown.far && Math.abs(e.clientX - _rdown.x) + Math.abs(e.clientY - _rdown.y) > 4) _rdown.far = true; }
function onMenu(e) { var r = _rdown; _rdown = null; if (r && r.far && gestureOf(_m, 'pan') === 'right' && onMap(e.target)) eat(e); }
// Settings, Keys: wait for the next press for one command. A plain click or Esc lets the wait go, Backspace or Delete takes the press off
function pickPress(e) {
    var p = _pick, n = mouseOf(e);
    if (p.btn && (p.btn === e.target || (p.btn.contains && p.btn.contains(e.target))) && n === 'Left') { _pick = null; unmark(p); eat(e); _ate = 0; done(p, 'No mouse press was changed.'); return; }
    if (n === 'Left') { _pick = null; unmark(p); done(p, 'No mouse press was changed.'); return; }   // a click elsewhere goes where it was meant to
    eat(e); _ate = e.button;
    var why = mapTakes(n, _m); if (why) { say(p, why + ' The wait goes on.'); return; }
    _pick = null; unmark(p);
    var took = mouseAt(_m.cmds, n); if (took === p.id) took = '';
    var m = mMine(); m.cmds[p.id] = n; if (took) m.cmds[took] = '';
    var ok = mSave(m); _m = mMine();
    mLog(ok ? 'mouse-set' : 'mouse-save-failed', { id: p.id, press: n });
    done(p, ok ? p.name + ' is ' + mouseName(n) + ' now.' + (took ? ' ' + ((p.names || {})[took] || 'Another command') + ' had it and has none now.' : '') + (sideButton(n) ? '' : ' It runs on the map.') : 'The press could not be kept on this computer.');
}
function say(p, w) { if (typeof p.say === 'function') p.say(w); }
function done(p, w) { if (typeof p.done === 'function') p.done(w); }
function unmark(p) { if (p.btn && p.btn.classList) { p.btn.classList.remove('hk-picking'); p.btn.removeAttribute('aria-pressed'); } }
function pickKey(e) {
    var p = _pick; if (!p || e.target !== p.btn) return;
    if (e.key === 'Tab') { _pick = null; unmark(p); done(p, ''); return; }
    e.preventDefault(); e.stopPropagation();
    if (e.key === 'Escape') { _pick = null; unmark(p); done(p, 'No mouse press was changed.'); return; }
    if (e.key === 'Backspace' || e.key === 'Delete') { _pick = null; unmark(p); var m = mMine(); m.cmds[p.id] = ''; var ok = mSave(m); _m = mMine(); mLog(ok ? 'mouse-off' : 'mouse-save-failed', { id: p.id }); done(p, ok ? p.name + ' has no mouse press now.' : 'The change could not be kept on this computer.'); }
}
if (typeof window !== 'undefined') {
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('mousedown', function(e) { if (_ate >= 0 && e.button === _ate) eat(e); }, true);
    window.addEventListener('pointerup', onUp, true); window.addEventListener('mouseup', onUp, true);
    ['click', 'auxclick', 'contextmenu'].forEach(function(k) { window.addEventListener(k, onAfter, true); });
    window.addEventListener('contextmenu', onMenu, true);
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('keydown', pickKey, true);
    window.wpMouse = {
        has: function(id) { return cmdOk(id); },
        word: function(id) { return mouseName(_m.cmds[id] || ''); },
        gesture: function(g) { return gestureOf(_m, g); },
        panButton: function() { var p = gestureOf(_m, 'pan'); return p === 'middle' ? 1 : p === 'right' ? 2 : -1; },
        pick: function(id, name, names, btn, done, sayFn) {
            if (!cmdOk(id)) return false;
            if (_pick && _pick.id === id) { var was = _pick; _pick = null; unmark(was); if (typeof done === 'function') done('No mouse press was changed.'); return false; }
            if (_pick) { unmark(_pick); _pick = null; }
            _pick = { id: id, name: name || id, names: names || {}, btn: btn || null, done: done, say: sayFn };
            if (btn && btn.classList) { btn.classList.add('hk-picking'); btn.setAttribute('aria-pressed', 'true'); }
            return true;
        },
        picking: function(id) { return !!_pick && (id === undefined || _pick.id === id); },
        setGesture: function(g, w) {
            if (GESTURE_IDS.indexOf(g) < 0 || !GESTURES[g].some(function(o) { return o[0] === w; })) return false;
            var m = mMine(); m[g] = w; var ok = mSave(m); _m = mMine(); mLog(ok ? 'gesture-set' : 'mouse-save-failed', { g: g, w: w }); return ok;
        },
        gestureWords: gestureWords,
        reset: function() { try { localStorage.removeItem('wp_mouse'); } catch (e) {} _m = mMine(); mLog('mouse-reset', {}); },
        reload: function() { _m = mMine(); }   // a profile opened here brought its mouse
    };
}
