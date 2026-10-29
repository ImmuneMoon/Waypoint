/* Waypoint's commands (1.6.0, backlog 33; the owner, 2026-10-29, by prompt: "Tools and settings in it", "Recent maps on one key" and
   "Hotkey settings"). ONE list, COMMANDS, says what each command is: its id, its name, what it does in a short sentence, other words it is
   found by, and how it runs. The quick jump (Ctrl+K, main.js cmdk*) lists the commands that can run now beside the maps and the pages, and
   finds each of Settings' options by its name (setRows: read from the page as it stands, so a new option is found with no list to keep).
   A tool runs through its own button's press (whiteboard.js wireTool and toolPress decide what the press does), so a row of the quick jump
   does what a press of the icon does: it takes the tool, and puts away a tool already in hand. Every run is logged (steplog.js, the area
   "commands v1"): its id, how it was asked for and whether it ran, never a name of the campaign's.
   A new command is one more entry of COMMANDS, { id, name, does, also, icon, key, can, run, act }: can() answers true or the words that
   say why not, run() does it, act() says in words what Enter does, and key is its default key (keycore.js names keys). Backlog 202 (moving
   tokens from the keyboard and a controller) adds its own rows here.
   A key runs its command from anywhere on the page but a field being typed in, never while a question, a prompt, a window, the welcome
   screen or the tour is up, and never in the stream window or a window of its own (hotkeyHeld). It is heard after every listener of the
   page (at the window, as the key comes back up), so a key a box or a dialog takes for itself never reaches it. Published as window.wpCommands. */
import { state } from './state.js';
import { getActiveMap, getActiveCampaign } from './models.js';
import { toast } from './io.js';
import { navigateToMap } from './sidebar.js';
import { keyOf, keyName, keysNow, keyAt } from './keycore.js';

// [shelfcheck:cmds-start]
// A tool of the play map's toolbar: its id, its name, the button that is its press, what it does, other words that find it, and how its
// press reads ('' takes it and puts it away again, 'keep' only takes it, 'menu' opens its menu)
var CMD_TOOLS = [
    ['tool.select', 'Select', 'moveModeBtn', 'Pick and move pieces on the map.', ['move', 'arrow'], 'keep'],
    ['tool.pan', 'Pan', 'panModeBtn', 'Drag to move the view. Pieces stay put.', ['hand'], ''],
    ['tool.pen', 'Pen', 'drawModeBtn', 'Draw on the map.', ['draw'], ''],
    ['tool.eraser', 'Eraser', 'eraserModeBtn', 'Rub out strokes.', ['erase'], ''],
    ['tool.fill', 'Fill', 'fillModeBtn', 'Color grid cells.', ['paint', 'colour'], ''],
    ['tool.build', 'Build', 'buildModeBtn', 'Lay floors, walls, doors and water.', ['wall', 'floor'], ''],
    ['tool.ruler', 'Ruler', 'measureModeBtn', 'Measure a distance.', ['measure', 'distance'], ''],
    ['tool.radius', 'Radius', 'blastModeBtn', 'Place a circle, a ring or a cone.', ['blast', 'circle', 'cone'], ''],
    ['tool.fog', 'Fog of war', 'fogModeBtn', 'Open the fog menu.', ['fog'], 'menu'],
    ['tool.env', 'Environment', 'envModeBtn', 'Paint temperature and the other readings.', ['temperature', 'weather'], '']
];
// A window the top row opens: its id, its name, its button, what it is, other words that find it
var CMD_WINDOWS = [
    ['open.settings', 'Settings', 'settingsBtn', 'Your profile, the look and every option.', ['options', 'preferences']],
    ['open.help', 'Help', 'helpBtn', 'How every part of Waypoint works.', ['guide', 'manual']]
];
function cmdLog(step, facts) { try { if (typeof window.wpStepLog === 'function') window.wpStepLog('commands v1', step, facts); } catch (e) {} }
function cmdShown(el) { return !!el && typeof el.getClientRects === 'function' && el.getClientRects().length > 0; }
function cmdPlayMap() { var m = getActiveMap(); return !!m && m.type === 'map' && state.viewMode === 'visual'; }
function toolCan(t) {
    var b = document.getElementById(t[2]);
    if (!b) return t[1] + ' is not in this window.';
    if (!cmdPlayMap()) return t[1] + ' works on the play map.';
    if (b.disabled === true || !cmdShown(b)) return t[1] + ' is not on your toolbar here.';
    return true;
}
function toolAct(t) {
    if (t[5] === 'menu') return 'Enter opens the fog menu.';
    var b = document.getElementById(t[2]), held = !!b && !!b.classList && b.classList.contains('active');
    if (held && t[5] === 'keep') return t[1] + ' is in your hand.';
    return held ? 'Enter puts ' + t[1] + ' away.' : 'Enter takes ' + t[1] + '.';
}
// The map you were on last (the owner, 2026-10-29: "Recent maps on one key", its key "Q (Recommended)"): the newest map of this computer's
// list (sidebar.js keeps it, wp_recent_<campaign>, newest first) that is not the one on screen, gone to as a map tab goes there. A second
// press goes back the other way, since the list then holds the map left first
function lastMapOf(camp, store) {
    if (!camp || !camp.items || typeof camp.id !== 'string' || !store) return '';
    var list = []; try { list = JSON.parse(store.getItem('wp_recent_' + camp.id) || '[]'); } catch (e) { return ''; }
    if (!Array.isArray(list)) return '';
    for (var i = 0; i < list.length; i++) {
        var id = list[i];
        if (typeof id === 'string' && id !== camp.activeItemId && Object.prototype.hasOwnProperty.call(camp.items, id) && camp.items[id] && camp.items[id].type === 'map') return id;
    }
    return '';
}
function lastStore() { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } }
function lastCan() {
    var n = window.wpNet;
    if (n && n.active && n.role === 'client') return 'At a table the GM picks the map.';
    var camp = getActiveCampaign(); if (!camp) return 'No campaign is open.';
    return lastMapOf(camp, lastStore()) ? true : 'There is no map to go back to yet.';
}
function lastAct() {
    var camp = getActiveCampaign(), id = lastMapOf(camp, lastStore()), m = id ? camp.items[id] : null, t = m && m.meta && typeof m.meta.title === 'string' && m.meta.title.trim() ? m.meta.title.trim().slice(0, 60) : '';
    return t ? 'Enter goes back to ' + t + '.' : 'Enter goes back to the map you were on.';
}
var CMD_LAST = { id: 'map.last', name: 'Last map', does: 'Go back to the map you were on before.', also: ['previous', 'recent', 'back'], icon: '\u21A9\uFE0F', key: 'KeyQ',
    can: lastCan, run: function() { var id = lastMapOf(getActiveCampaign(), lastStore()); if (!id || navigateToMap(id) === false) throw new Error('not gone'); }, act: lastAct };
function winCan(w) { var b = document.getElementById(w[2]); return b && b.disabled !== true ? true : w[1] + ' is not in this window.'; }
var COMMANDS = CMD_TOOLS.map(function(t) {
    return { id: t[0], name: t[1], does: t[3], also: t[4], icon: '\u{1F6E0}️', can: function() { return toolCan(t); },
        run: function() { document.getElementById(t[2]).click(); }, act: function() { return toolAct(t); } };   // the tool's own press, as the toolbar's
}).concat([CMD_LAST], CMD_WINDOWS.map(function(w) {
    return { id: w[0], name: w[1], does: w[3], also: w[4], icon: w[0] === 'open.settings' ? '⚙️' : '❔', can: function() { return winCan(w); },
        run: function() { document.getElementById(w[2]).click(); }, act: function() { return 'Enter opens ' + w[1] + '.'; } };
}));
function cmdById(id) { for (var i = 0; i < COMMANDS.length; i++) if (COMMANDS[i].id === id) return COMMANDS[i]; return null; }
function cmdCan(c) { try { return c.can(); } catch (e) { return 'That cannot run now.'; } }
// Run a command. via: 'jump' (the quick jump) or 'key'. Answers true, or the words that say why it did not run
function cmdRun(id, via) {
    var c = cmdById(id), how = via === 'key' ? 'key' : 'jump';
    if (!c) { cmdLog('run-unknown', { via: how }); return 'There is no such command.'; }
    var ok = cmdCan(c);
    if (ok !== true) { cmdLog('run-held', { id: c.id, via: how }); return typeof ok === 'string' ? ok : 'That cannot run now.'; }
    try { c.run(); } catch (e) { cmdLog('run-failed', { id: c.id, via: how }); return c.name + ' did not run.'; }
    cmdLog('run', { id: c.id, via: how });
    return true;
}
// [shelfcheck:cmds-end]

// [shelfcheck:hotkey-start]
// Each command's key now: its default from the list, unless this computer's choice says another or none (keycore keysNow)
var _keys = {};
function keysMine() { return {}; }
function keysTalk() { try { var v = typeof localStorage !== 'undefined' ? localStorage.getItem('wp_voice_bind') : null; return typeof v === 'string' && v ? v : 'KeyV'; } catch (e) { return 'KeyV'; } }   // voice.js: push to talk, V at first
function keysLoad() { _keys = keysNow(COMMANDS, keysMine(), keysTalk()); return _keys; }
// Why a key press runs no command now, as one short word, or '' where it may: a press held down, a key a listener took, a window of its
// own or the stream window, a field being typed in (told by isContentEditable and the field tags), the tour, a question
// or a prompt of the app's own, the welcome screen (a website's join page among them), a window of the app's
function hotkeyHeld(doc, win, e) {
    if (!e || e.repeat === true) return 'repeat';
    if (e.defaultPrevented === true) return 'taken';
    if (win.wpStream || win.wpPopout) return 'window';
    var t = e.target, tag = t && t.tagName ? String(t.tagName).toUpperCase() : '';
    if (t && (t.isContentEditable === true || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT')) return 'typing';
    var b = doc.body; if (b && b.classList && b.classList.contains('tour-on')) return 'tour';   // a website's join page is the welcome screen, held below
    var up = function(el) { return !!el && typeof el.getClientRects === 'function' && el.getClientRects().length > 0; };
    if (up(doc.getElementById('customConfirm')) || up(doc.getElementById('customPrompt'))) return 'asking';
    if (up(doc.getElementById('welcomeScreen'))) return 'welcome';
    var wins = doc.querySelectorAll('[id$="Modal"]');
    for (var i = 0; i < wins.length; i++) if (up(wins[i])) return 'window';
    return '';
}
function hotkeyDown(e) {
    var k = keyOf(e); if (!k || k === keysTalk()) return;   // a held key alone, and push to talk's own key, are no command's
    var id = keyAt(_keys, k); if (!id) return;
    var why = hotkeyHeld(document, window, e);
    if (why) { if (why !== 'repeat' && why !== 'typing') cmdLog('key-held', { id: id, why: why }); return; }
    e.preventDefault();
    var r = cmdRun(id, 'key');
    if (r !== true) toast(r);
}
// [shelfcheck:hotkey-end]
keysLoad();
cmdLog('keys-load', { n: Object.keys(_keys).filter(function(id) { return !!_keys[id]; }).length });
window.addEventListener('keydown', hotkeyDown);   // at the window, coming back up: after every listener of the page
window.wpCommandKey = function(id) { return keyName(_keys[id] || ''); };

// [shelfcheck:setrows-start]
// Settings' options, read from the page as it stands: a group by its heading, an option by its name (a .set-field-label, a label, or a
// button whose grey line stands under it), each with its own words alone: never the state shown beside it, its grey line, a list's
// choices or a control's words. An option the page has put away (a GM's on a player's app, a website's plan, a row hidden by its switch)
// is not found. Of two options of the same words in one place the first is kept
var SET_SKIP = { SMALL: 1, SELECT: 1, INPUT: 1, BUTTON: 1, OPTION: 1, TEXTAREA: 1 };
function setWords(el) {
    var out = '', kids = el && el.childNodes ? el.childNodes : [];
    for (var i = 0; i < kids.length; i++) {
        var n = kids[i];
        if (n.nodeType === 3) out += ' ' + n.nodeValue;
        else if (n.nodeType === 1 && !SET_SKIP[n.tagName] && !n.id) out += ' ' + setWords(n);
    }
    return out.replace(/\s+/g, ' ').trim();
}
function setName(el) {
    var w = (el.tagName === 'BUTTON' ? String(el.textContent || '') : setWords(el)).replace(/\s+/g, ' ').replace(/^[^A-Za-z0-9]+/, '').trim();
    if (w.length > 48 && w.indexOf(' (') > 0) w = w.slice(0, w.indexOf(' ('));   // a long name loses what its bracket adds
    return w.slice(0, 60);
}
function setNext(el) { var n = el ? el.nextSibling : null; while (n && n.nodeType !== 1) n = n.nextSibling; return n || null; }   // the element after it, past the text between
function setHidden(el, top, win) {
    for (var p = el; p && p !== top; p = p.parentNode) {
        if (p.hidden === true) return true;
        var cs = win && typeof win.getComputedStyle === 'function' && p.nodeType === 1 ? win.getComputedStyle(p) : null;
        if (cs && cs.display === 'none') return true;
    }
    return false;
}
function setRows(doc, win) {
    var top = doc.getElementById('settingsModal'), out = [], seen = {};
    if (!top) return out;
    var add = function(name, sub, group, el) { var k = (sub + '|' + name).toLowerCase(); if (!name || seen[k]) return; seen[k] = 1; out.push({ name: name, sub: sub, group: group, el: el }); };
    Array.prototype.forEach.call(top.querySelectorAll('details.set-group'), function(g) {
        var sum = g.querySelector('summary'), gname = sum ? setWords(sum) : '', gkey = g.getAttribute('data-group') || '';
        if (!gname || setHidden(g, top, win)) return;
        add(gname, 'Settings', gkey, g);   // the group itself
        Array.prototype.forEach.call(g.querySelectorAll('.set-field-label, label, button.tool'), function(el) {
            if (el.tagName === 'BUTTON') { var nx = setNext(el); if (!nx || !nx.classList || !nx.classList.contains('set-line')) return; }   // a button that is an option of its own has its grey line under it
            if (!setHidden(el, top, win)) add(setName(el), 'Settings ▸ ' + gname, gkey, el);
        });
    });
    return out;
}
// The control an option is set with: the option itself where it is one, the box or list in its label, or the control under its name
function setControl(el) {
    if (!el) return null;
    if (/^(BUTTON|INPUT|SELECT)$/.test(el.tagName)) return el;
    if (el.tagName === 'DETAILS') return el.querySelector('summary');
    var own = el.querySelector('input, select, button'); if (own) return own;
    var nx = setNext(el);
    if (nx && /^(BUTTON|INPUT|SELECT)$/.test(nx.tagName)) return nx;
    return nx && typeof nx.querySelector === 'function' ? nx.querySelector('input, select, button') : null;
}
// [shelfcheck:setrows-end]

// Settings opened at an option: its group and every fold around it opened, the option brought into sight and marked a moment, its control
// given the focus
function setOpen(row) {
    if (!row || !row.el) return false;
    if (typeof window.wpOpenSettings === 'function') window.wpOpenSettings(row.group || '');
    for (var p = row.el; p; p = p.parentNode) if (p.tagName === 'DETAILS') p.open = true;
    setTimeout(function() {
        var el = row.el, c = setControl(el);
        try { el.scrollIntoView({ block: 'center' }); } catch (e) {}
        if (c && typeof c.focus === 'function') { try { c.focus({ preventScroll: true }); } catch (e) {} }
        el.classList.add('set-found');
        setTimeout(function() { el.classList.remove('set-found'); }, 1600);
    }, 60);
    cmdLog('setting-open', { group: row.group || 'none' });
    return true;
}

// The quick jump's rows: the commands that can run now, then Settings' options (main.js cmdkBuild). A key beside a command is its key
// where it has one (keyFor)
var _setFound = [];
function keyFor(id) { return typeof window.wpCommandKey === 'function' ? String(window.wpCommandKey(id) || '') : ''; }
function jumpRows() {
    var out = [];
    COMMANDS.forEach(function(c) { if (cmdCan(c) === true) out.push({ kind: 'cmd', label: c.name, sub: c.does, cmdId: c.id, also: c.also || [], icon: c.icon, key: keyFor(c.id) }); });
    _setFound = setRows(document, window);
    _setFound.forEach(function(r, i) { out.push({ kind: 'set', label: r.name, sub: r.sub, setAt: i, icon: '⚙️' }); });
    return out;
}
function jumpGo(en) {
    if (!en) return false;
    if (en.kind === 'set') return setOpen(_setFound[en.setAt]);
    var r = cmdRun(en.cmdId, 'jump');
    if (r !== true) toast(r);
    return r === true;
}
function jumpAct(en) {
    if (!en) return '';
    if (en.kind === 'set') return 'Enter opens Settings at this option.';
    var c = cmdById(en.cmdId); if (!c) return '';
    try { return String(c.act() || ''); } catch (e) { return ''; }
}

window.wpCommands = { list: COMMANDS, byId: cmdById, run: cmdRun, rows: jumpRows, go: jumpGo, act: jumpAct, settingRows: function() { return setRows(document, window); }, openSetting: setOpen };
export { COMMANDS, cmdById, cmdRun, jumpRows, jumpGo, jumpAct, setRows };
