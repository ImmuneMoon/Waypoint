// Mouse bindings (1.6.2; the owner, 2026-11-05: "lets add mapping for mouse clicks and controls too", by prompt "Commands and the map's
// gestures (Recommended)", "Yes, like keys (Recommended)", "A short list each (Recommended)" and "Side buttons anywhere (Recommended)").
// mousecore.js imported and run; mousemap.js run on a page of plain objects; the board's four gestures, Settings, the profile and the words pinned.
'use strict';
const fs = require('fs'), path = require('path'), url = require('url'), vm = require('vm');
const root = path.join(__dirname, '..'), app = p => path.join(root, 'system', 'app', p), read = p => fs.readFileSync(p, 'utf8');
let pass = 0, fail = 0, summed = false;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail !== undefined ? ' -> ' + JSON.stringify(detail) : '')); } }
const J = JSON.stringify;
process.on('exit', () => { if (!summed) { console.log('FAIL      the suite never reached its summary'); process.exitCode = 1; } });

(async () => {
    const M = await import(url.pathToFileURL(app('scripts/mousecore.js')).href);

    // names
    const ev = (button, o) => Object.assign({ button, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false }, o || {});
    check('a press is named as a key is, its keys first in one order: Ctrl, Alt, Shift, then the button; a button the browser numbers past Forward has no name; the command key reads as Ctrl',
        M.mouseOf(ev(0)) === 'Left' && M.mouseOf(ev(1)) === 'Middle' && M.mouseOf(ev(2)) === 'Right' && M.mouseOf(ev(3)) === 'Back' && M.mouseOf(ev(4)) === 'Forward'
        && M.mouseOf(ev(1, { shiftKey: true, altKey: true, ctrlKey: true })) === 'Ctrl+Alt+Shift+Middle' && M.mouseOf(ev(3, { metaKey: true })) === 'Ctrl+Back'
        && M.mouseOf(ev(5)) === '' && M.mouseOf(null) === '' && M.mouseOf({}) === '');
    check('a press in words: "Ctrl + middle click", "Back button", "Alt + click"; anything else none',
        M.mouseName('Ctrl+Middle') === 'Ctrl + middle click' && M.mouseName('Back') === 'Back button' && M.mouseName('Alt+Left') === 'Alt + click' && M.mouseName('Shift+Forward') === 'Shift + Forward button'
        && M.mouseName('Middle') === 'Middle click' && M.mouseName('Left') === 'Click' && M.mouseName('Wheel') === '' && M.mouseName('Shift+Ctrl+Left') === '' && M.mouseName(7) === '');
    check('the side buttons run anywhere in the window, every other press on the map alone (the owner: "Side buttons anywhere")',
        M.mouseWhere('Back') === 'anywhere' && M.mouseWhere('Ctrl+Forward') === 'anywhere' && M.mouseWhere('Middle') === 'map' && M.mouseWhere('Alt+Shift+Left') === 'map' && M.mouseWhere('Ctrl+Right') === 'map');

    // what the map keeps
    const g0 = { cmds: {} };
    check('the map keeps its own presses: a plain click, a right click, Ctrl or Shift with a click (the selection), the ping\'s own click, and the press that pans; each said in words',
        /stays the map/.test(M.mapTakes('Left', g0)) && /menu/.test(M.mapTakes('Right', g0)) && /selection/.test(M.mapTakes('Ctrl+Left', g0)) && /selection/.test(M.mapTakes('Shift+Left', g0)) && /selection/.test(M.mapTakes('Ctrl+Shift+Left', g0))
        && /pings/.test(M.mapTakes('Alt+Left', g0)) && /pans/.test(M.mapTakes('Middle', g0))
        && M.mapTakes('Ctrl+Middle', g0) === '' && M.mapTakes('Back', g0) === '' && M.mapTakes('Ctrl+Right', g0) === '' && /selection/.test(M.mapTakes('Alt+Shift+Left', g0)) && /no mouse press/.test(M.mapTakes('Wheel', g0)));
    const gr = { cmds: {}, pan: 'right', ping: 'ctrlalt' };
    check('the gestures move what the map keeps: with Pan on the right button the middle click is free and a plain right click is still the menu\'s; with the ping on Ctrl + Alt, Alt + click is free and Ctrl + Alt + click is the ping\'s',
        M.mapTakes('Middle', gr) === '' && /menu/.test(M.mapTakes('Right', gr)) && M.mapTakes('Alt+Left', gr) === '' && /pings/.test(M.mapTakes('Ctrl+Alt+Left', gr)) && M.mapTakes('Middle', { cmds: {}, pan: 'off' }) === '');

    // gestures
    check('each gesture is a short list, its first what it does as it comes (the owner: "A short list each"): pan by the middle button, the right or not at all; zoom by the wheel or Ctrl + wheel; ping by Alt + click or Ctrl + Alt + click; open a piece by a double-click or Shift + double-click',
        J(M.GESTURE_IDS) === J(['pan', 'zoom', 'ping', 'open']) && J(M.GESTURES.pan.map(o => o[0])) === J(['middle', 'right', 'off']) && J(M.GESTURES.zoom.map(o => o[0])) === J(['wheel', 'ctrl'])
        && J(M.GESTURES.ping.map(o => o[0])) === J(['alt', 'ctrlalt']) && J(M.GESTURES.open.map(o => o[0])) === J(['dbl', 'shiftdbl'])
        && M.gestureOf({}, 'pan') === 'middle' && M.gestureOf({ pan: 'right' }, 'pan') === 'right' && M.gestureOf({ pan: 'sideways' }, 'pan') === 'middle' && M.gestureOf(null, 'zoom') === 'wheel' && M.gestureOf({}, 'nope') === ''
        && M.gestureWords('zoom', 'ctrl') === 'Ctrl + wheel' && M.gestureWords('zoom', 'x') === '');

    // what is kept
    const raw = { cmds: { 'map.last': 'Back', 'tool.pen': 'Ctrl+Middle', 'page.scene': '', 'tool.x': 'Wheel', '__proto__': 'Back', 'constructor': 'Back', 'Not.an.id': 'Back', 'a.b': 7 }, pan: 'right', zoom: 'wheel', ping: 'shout', open: 'shiftdbl', extra: 1 };
    const c = M.mouseClean(raw);
    check('what this computer keeps is read as data: a command id and a press by its name, or none; a gesture only as a word of its list, and none for its first, so a store that says nothing new is as it was; anything else dropped',
        J(c) === J({ cmds: { 'map.last': 'Back', 'tool.pen': 'Ctrl+Middle', 'page.scene': '' }, pan: 'right', open: 'shiftdbl' })
        && J(M.mouseClean(null)) === J({ cmds: {} }) && J(M.mouseClean([1])) === J({ cmds: {} }) && J(M.mouseClean({ cmds: [] })) === J({ cmds: {} })
        && J(M.mouseClean(raw, ['map.last']).cmds) === J({ 'map.last': 'Back' }), c);
    check('the command a press runs is found by the press', M.mouseAt({ a: 'Back', b: 'Middle' }, 'Middle') === 'b' && M.mouseAt({}, 'Back') === '' && M.mouseAt(null, 'Back') === '');

    // the module on a page of plain objects
    const src = read(app('scripts/mousemap.js')).replace(/^import[^\n]*\n/gm, '');
    const listeners = {}, store = {}, logs = [], toasts = [], ran = [];
    const mkEl = (inMap, tag) => ({ tagName: tag || 'DIV', classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } }, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; },
        closest(sel) { if (/whiteboardWrap/.test(sel) && sel.indexOf('button') < 0) return inMap ? {} : null; if (/button/.test(sel)) return tag === 'BUTTON' ? this : null; return null; }, contains(x) { return x === this; } });
    const win = { addEventListener: (k, f) => { (listeners[k] = listeners[k] || []).push(f); }, wpStepLog: (a, s, f) => logs.push(s),
        wpCommands: { byId: id => ({ 'map.last': { id }, 'tool.pen': { id }, 'token.up': { id, own: true } })[id] || null, run: (id, via) => { ran.push(id + ':' + via); return true; }, heldNow: () => win._held || '' } };
    const ls = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
    const ctx = { window: win, localStorage: ls, toast: w => toasts.push(w), setTimeout: f => f(), JSON, Object, Array, Math, String };
    Object.keys(M).forEach(k => { ctx[k] = M[k]; });
    vm.createContext(ctx); vm.runInContext(src, ctx);
    const W = win.wpMouse;
    const fire = (k, e) => { (listeners[k] || []).forEach(f => f(e)); return e; };
    const press = (button, o, target) => { const e = Object.assign(ev(button, o), { target, clientX: 10, clientY: 10, _stop: 0, _prev: 0, preventDefault() { this._prev++; }, stopImmediatePropagation() { this._stop++; } }); fire('pointerdown', e); return e; };
    const mapEl = mkEl(true), offEl = mkEl(false), btn = mkEl(false, 'BUTTON');
    const said = [];
    // a pick in Settings
    W.pick('map.last', 'Last map', { 'tool.pen': 'Pen' }, btn, w => said.push('done:' + w), w => said.push('say:' + w));
    const marked = btn.classList.contains('hk-picking') && btn.attrs['aria-pressed'] === 'true';
    const r1 = press(2, {}, offEl);   // a plain right click: the map's, and the wait goes on
    const stillWaiting = W.picking('map.last') && r1._stop === 1 && /menu/.test(said[said.length - 1]);
    const r2 = press(3, {}, offEl);   // Back: kept
    const setBack = !W.picking() && J(JSON.parse(store.wp_mouse).cmds) === J({ 'map.last': 'Back' }) && /Last map is Back button now\./.test(said[said.length - 1]) && r2._stop === 1 && !btn.classList.contains('hk-picking') && logs.includes('mouse-set');
    check('Settings picks a press for a command: the box is marked while it waits, a plain right click is refused in words and the wait goes on, the next press that may be the command\'s is kept on this computer and said, and the box is no longer marked',
        marked && stillWaiting && setBack, said);
    // it runs anywhere
    ran.length = 0; const r3 = press(3, {}, offEl);
    const after = fire('auxclick', Object.assign(ev(3), { _stop: 0, preventDefault() {}, stopImmediatePropagation() { this._stop++; } }));
    check('a side button runs its command anywhere in the window, as a press of the mouse, and what follows that press goes no further (no browser Back, no click)', J(ran) === J(['map.last:mouse']) && r3._stop === 1 && after._stop === 1, ran);
    win._held = 'window'; ran.length = 0; press(3, {}, offEl); win._held = '';
    check('a press runs nothing where a key would run nothing (a window, a question, a box being typed in), and says so in the log', ran.length === 0 && logs.includes('held'));
    // a press of the map alone
    W.pick('tool.pen', 'Pen', { 'map.last': 'Last map' }, btn, w => said.push('done:' + w), w => said.push('say:' + w)); press(1, { ctrlKey: true }, offEl);
    ran.length = 0; const off = press(1, { ctrlKey: true }, offEl), on = press(1, { ctrlKey: true }, mapEl), onBtn = press(1, { ctrlKey: true }, Object.assign(mkEl(true, 'BUTTON'), { closest(sel) { return /button/.test(sel) ? this : {}; } }));
    check('any other press runs its command on the map alone: Ctrl + middle click runs the Pen there, and does nothing over a list, a button or a box outside it or on a control over it',
        J(ran) === J(['tool.pen:mouse']) && off._stop === 0 && on._stop === 1 && onBtn._stop === 0, ran);
    // the press another command has moves, as a key does
    W.pick('tool.pen', 'Pen', { 'map.last': 'Last map' }, btn, w => said.push('done:' + w), w => said.push('say:' + w)); press(3, {}, offEl);
    check('a press another command has moves to the one picked, and that command is left with none, said in the same line', J(JSON.parse(store.wp_mouse).cmds) === J({ 'map.last': '', 'tool.pen': 'Back' }) && /Last map had it and has none now\./.test(said[said.length - 1]), said[said.length - 1]);
    // Esc, Backspace, a click elsewhere, the box again
    W.pick('tool.pen', 'Pen', {}, btn, w => said.push('done:' + w)); const esc = { key: 'Escape', target: btn, preventDefault() {}, stopPropagation() {} }; fire('keydown', esc);
    const escOk = !W.picking() && /No mouse press was changed/.test(said[said.length - 1]);
    W.pick('tool.pen', 'Pen', {}, btn, w => said.push('done:' + w)); fire('keydown', { key: 'Backspace', target: btn, preventDefault() {}, stopPropagation() {} });
    const offOk = !W.picking() && JSON.parse(store.wp_mouse).cmds['tool.pen'] === '' && /Pen has no mouse press now\./.test(said[said.length - 1]);
    W.pick('tool.pen', 'Pen', {}, btn, w => said.push('done:' + w)); const away = press(0, {}, offEl);
    const awayOk = !W.picking() && away._stop === 0;
    W.pick('tool.pen', 'Pen', {}, btn, w => said.push('done:' + w)); const again = press(0, {}, btn);
    const againOk = !W.picking() && again._stop === 1;
    check('Esc lets the wait go, Backspace or Delete takes the press off, a plain click elsewhere lets the wait go and goes where it was meant to, and a click on the box again lets it go', escOk && offOk && awayOk && againOk, { escOk, offOk, awayOk, againOk });
    check('a move is its key\'s alone: no mouse press can be given to it', W.has('token.up') === false && W.pick('token.up', 'Move up', {}, btn) === false && W.has('map.last') === true);
    // gestures
    const setOk = W.setGesture('pan', 'right') && W.gesture('pan') === 'right' && W.panButton() === 2 && !W.setGesture('pan', 'sideways') && W.gesture('pan') === 'right' && !W.setGesture('nope', 'x');
    W.setGesture('pan', 'off'); const offPan = W.panButton() === -1; W.setGesture('pan', 'middle'); const midPan = W.panButton() === 1 && !('pan' in JSON.parse(store.wp_mouse));
    check('a gesture is set by a word of its list alone, kept on this computer, and its first word keeps nothing; the pan\'s button follows it', setOk && offPan && midPan, store.wp_mouse);
    W.setGesture('pan', 'right'); const mv = { button: 2, clientX: 10, clientY: 10, target: mapEl }; fire('pointerdown', Object.assign(ev(2), mv, { preventDefault() {}, stopImmediatePropagation() {} }));
    fire('pointermove', { clientX: 40, clientY: 10 }); const cm = fire('contextmenu', { button: 2, target: mapEl, _stop: 0, preventDefault() {}, stopImmediatePropagation() { this._stop++; } });
    fire('pointerdown', Object.assign(ev(2), mv, { preventDefault() {}, stopImmediatePropagation() {} })); const cm2 = fire('contextmenu', { button: 2, target: mapEl, _stop: 0, preventDefault() {}, stopImmediatePropagation() { this._stop++; } });
    check('with Pan on the right button a right drag opens no menu at its end, and a right click that did not move still does', cm._stop === 1 && cm2._stop === 0);
    W.reset(); check('Restore default keys puts the mouse back too: nothing kept', !('wp_mouse' in store) && W.gesture('pan') === 'middle' && W.word('tool.pen') === '');

    // the board reads the gestures
    const dm = read(app('scripts/datamap.js')), wb = read(app('scripts/whiteboard.js'));
    check('the board reads the four gestures: the pan by wpMouse.panButton (the middle button where no module is), the wheel by the zoom\'s word, the ping by its word, and the double-click that opens a piece by its word',
        /panBtnNow\(e\)/.test(dm) && /window\.wpMouse && typeof window\.wpMouse\.panButton === 'function' \? window\.wpMouse\.panButton\(\) : 1/.test(dm)
        && /window\.wpMouse\.gesture\('zoom'\) === 'ctrl' && !\(e\.ctrlKey \|\| e\.metaKey\)\) \{ e\.preventDefault\(\); var wk = [^;]*; wrapEl\.scrollLeft \+= \(e\.shiftKey \? e\.deltaY : e\.deltaX\) \* wk; if \(!e\.shiftKey\) wrapEl\.scrollTop \+= e\.deltaY \* wk; return; \}/.test(dm)
        && /window\.wpMouse\.gesture\('open'\) === 'shiftdbl' && !e\.shiftKey\) return;/.test(dm)
        && /window\.wpMouse\.gesture\('ping'\) === 'ctrlalt'/.test(wb));
    // Settings, the profile, the words
    const cmd = read(app('scripts/commands.js')), html = read(app('index.html')), pc = await import(url.pathToFileURL(app('scripts/profilecore.js')).href);
    check('Settings, under Keys: a Mouse column beside Key and Controller, its box asking wpMouse.pick, and the four gestures as lists under the commands, each with its words',
        cmd.includes("['set-mouse-col', 'Mouse']") && cmd.includes("mo.className = 'tool ghost set-mouse'") && /M\.pick\(c\.id, c\.name, keysNames\(\), mo,/.test(cmd)
        && ['setGesPan', 'setGesZoom', 'setGesPing', 'setGesOpen'].every(id => html.split('id="' + id + '"').length === 2) && html.includes('Space + drag always pans too.'));
    const store2 = { wp_profile: JSON.stringify({ id: 'p_abcdefgh12', name: 'Kael', color: '#aa3344' }), wp_mouse: JSON.stringify({ cmds: { 'map.last': 'Back', 'x.y': 'Wheel' }, pan: 'right', zoom: 'loud' }) };
    const pk = pc.packOf(store2, {}, 1);
    const w1 = pk ? pc.openWrites({}, pk) : null, w2 = pk ? pc.openWrites({ wp_keysLocal: '1' }, pk) : null;
    check('your mouse goes with your profile, cleaned, and a computer that keeps its own keys keeps its own mouse (the owner: "Yes, like keys")',
        !!pk && J(pk.mouse) === J({ cmds: { 'map.last': 'Back' }, pan: 'right' }) && w1 && w1.wp_mouse === J(pk.mouse) && w2 && !('wp_mouse' in w2)
        && !('mouse' in (pc.packOf({ wp_profile: store2.wp_profile }, {}, 1) || { mouse: 1 })), pk && pk.mouse);
    check('Restore default keys says it puts the mouse back too: the line under it, its tooltip, and what it says once pressed where the mouse was put back (the owner, 2026-11-05: "lets fix that gap")',
        html.includes('<div class="set-line tight">Every command gets the key it came with again, and the mouse goes back as it came. Your keys are kept on this computer.</div>') && html.includes('and puts the mouse and the map gestures back as they came, here on this computer">Restore default keys</button>')
        && cmd.includes("window.wpMouse.reset(); gesturesShow(doc); mouseBack = true; }") && cmd.includes("'Every command has the key it came with again' + (mouseBack ? ', and the mouse is back as it came.' : '.')"));
    summed = true;
    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exitCode = 1;
})();
