/* The keys of Waypoint's commands (1.6.0, backlog 33; the owner, 2026-10-29, by prompt: "Recent maps on one key", its key "Q
   (Recommended)", "Hotkey settings", and of the tools "A few default keys"). Pure: nothing of the page, so commands.js and Settings read
   it in the app and shelfcheck runs it under Node.
   A key is written as one name: the keys held, in the order Ctrl, Alt, Shift, then the key's own code (KeyboardEvent.code, the same key
   on every keyboard layout), as "KeyQ", "Shift+Digit2" or "Ctrl+Alt+KeyP". A Mac's Command key counts as Ctrl. A held key alone is no key.
   APP_KEYS are the keys the app and the window already use, each with what it does: no command takes one. A command's key is its own
   default (the list of commands says it) unless this computer's choice (wp_keys, kept by commands.js) says another or none.
   Published as window.wpKeyCore. */

var KEY_CODE = /^[A-Za-z0-9]{1,20}$/;
var KEY_HELD = /^(Control|Alt|Shift|Meta|OS)(Left|Right)?$|^(CapsLock|NumLock|ScrollLock|Fn|FnLock|ContextMenu|Unidentified)$/;
// A key press as one name, or '' for a press that is no key of its own (a held key alone, a press with no code)
function keyOf(e) {
    if (!e || typeof e.code !== 'string' || !KEY_CODE.test(e.code) || KEY_HELD.test(e.code)) return '';
    return (e.ctrlKey === true || e.metaKey === true ? 'Ctrl+' : '') + (e.altKey === true ? 'Alt+' : '') + (e.shiftKey === true ? 'Shift+' : '') + e.code;
}
// A key as stored: a name keyOf could write, or ''
function keyClean(v) {
    if (typeof v !== 'string' || v.length > 40) return '';
    var m = /^(Ctrl\+)?(Alt\+)?(Shift\+)?([A-Za-z0-9]{1,20})$/.exec(v);
    return m && !KEY_HELD.test(m[4]) ? v : '';
}
var KEY_WORDS = { Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',',
    Period: '.', Slash: '/', Space: 'Space', ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down', Escape: 'Esc', PageUp: 'Page Up',
    PageDown: 'Page Down', NumpadAdd: 'Num +', NumpadSubtract: 'Num -', NumpadMultiply: 'Num *', NumpadDivide: 'Num /', NumpadDecimal: 'Num .', NumpadEnter: 'Num Enter' };
// A key's name as it is said: "Ctrl+Shift+P", "Q", "Shift+1"; '' for no key
function keyName(k) {
    k = keyClean(k); if (!k) return '';
    var parts = k.split('+'), code = parts.pop();
    var w = /^Key[A-Z]$/.test(code) ? code.slice(3) : /^Digit[0-9]$/.test(code) ? code.slice(5) : /^Numpad[0-9]$/.test(code) ? 'Num ' + code.slice(6) : Object.prototype.hasOwnProperty.call(KEY_WORDS, code) ? KEY_WORDS[code] : code;
    return parts.concat([w]).join('+');
}
// The app's own keys and the window's, each with what it already does. The arrows nudge with and without Shift; Esc, Enter and Tab are
// refused with any key held (keyRefusal)
var APP_KEYS = {
    'Ctrl+KeyK': 'quick jump', 'Ctrl+KeyZ': 'Undo', 'Ctrl+KeyY': 'Redo', 'Ctrl+Shift+KeyZ': 'Redo', 'Ctrl+KeyC': 'Copy', 'Ctrl+KeyX': 'Cut', 'Ctrl+KeyV': 'Paste',
    'Ctrl+KeyD': 'Duplicate', 'Ctrl+KeyA': 'Select all', 'Ctrl+KeyF': 'Find', 'Ctrl+KeyB': 'bold text', 'Ctrl+KeyI': 'italic text', 'Ctrl+KeyU': 'underlined text',
    'Ctrl+Shift+KeyM': 'Mute', 'Shift+Digit1': 'Fit to content', 'KeyT': 'Target', 'Space': 'panning', 'Backquote': 'the developer console',
    'Delete': 'Delete', 'Backspace': 'Delete', 'ArrowLeft': 'nudging', 'ArrowRight': 'nudging', 'ArrowUp': 'nudging', 'ArrowDown': 'nudging',
    'Shift+ArrowLeft': 'nudging', 'Shift+ArrowRight': 'nudging', 'Shift+ArrowUp': 'nudging', 'Shift+ArrowDown': 'nudging', 'Alt+ArrowLeft': 'Back', 'Alt+ArrowRight': 'Forward',
    'Alt+F10': 'the text bar', 'Alt+KeyV': 'the View menu', 'Ctrl+KeyR': 'Reload', 'Ctrl+Shift+KeyR': 'Reload', 'F5': 'Reload', 'Ctrl+Digit0': 'Actual size',
    'Ctrl+Equal': 'Zoom in', 'Ctrl+Shift+Equal': 'Zoom in', 'Ctrl+Minus': 'Zoom out', 'F11': 'Full screen', 'F12': 'the developer tools',
    'Ctrl+Shift+KeyI': 'the developer tools', 'Ctrl+Shift+KeyJ': 'the developer tools', 'Ctrl+Shift+KeyC': 'the developer tools',
    'Ctrl+KeyW': 'closing the window', 'Ctrl+KeyN': 'a new window', 'Ctrl+KeyT': 'a new tab', 'Ctrl+KeyP': 'Print', 'Ctrl+KeyS': 'Save page', 'Alt+F4': 'closing the window'
};
// Why a command may not take a key, in words, or '' where it may. id: the command; keys: { command id: its key now }; names: { command id:
// its name }; talk: the push-to-talk key (voice.js, wp_voice_bind)
function keyRefusal(k, id, keys, names, talk) {
    var c = keyClean(k); if (!c) return 'That key cannot be used. Pick another.';
    var bare = c.split('+').pop(), n = keyName(c);
    if (bare === 'Escape') return 'Esc closes what is on top. Pick another key.';
    if (bare === 'Enter' || bare === 'NumpadEnter' || bare === 'Tab') return n + ' moves and presses in a window. Pick another key.';
    if (Object.prototype.hasOwnProperty.call(APP_KEYS, c)) return n + ' is already ' + APP_KEYS[c] + '. Pick another key.';
    if (typeof talk === 'string' && talk === c) return n + ' is already Push to talk. Pick another key.';
    var held = Object.keys(keys || {}).filter(function(o) { return o !== id && keys[o] === c; })[0];
    if (held) return n + ' is already ' + (names && typeof names[held] === 'string' ? names[held] : 'another command') + '. Pick another key.';
    return '';
}
// This computer's choice as stored: { command id: a key, or '' for none }, of the ids the list has
function keysClean(v, ids) {
    var out = {}; if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
    (Array.isArray(ids) ? ids : []).forEach(function(id) { if (typeof id === 'string' && Object.prototype.hasOwnProperty.call(v, id) && typeof v[id] === 'string') out[id] = v[id] === '' ? '' : keyClean(v[id]); });
    Object.keys(out).forEach(function(id) { if (out[id] === '' && v[id] !== '') delete out[id]; });   // a key that does not clean is no choice: the default stands
    return out;
}
// Each command's key now: this computer's choice first, then its default where no choice and no other key holds it. cmds: [{ id, key }]
function keysNow(cmds, mine, talk) {
    var out = {}, used = {}, list = Array.isArray(cmds) ? cmds : [], m = mine && typeof mine === 'object' ? mine : {};
    list.forEach(function(c) { if (c && Object.prototype.hasOwnProperty.call(m, c.id)) { var k = keyClean(m[c.id]); out[c.id] = k && !used[k] ? k : ''; if (out[c.id]) used[out[c.id]] = 1; } });
    list.forEach(function(c) {
        if (!c || Object.prototype.hasOwnProperty.call(out, c.id)) return;
        var d = keyClean(c.key), free = d && !used[d] && !Object.prototype.hasOwnProperty.call(APP_KEYS, d) && d !== talk;
        out[c.id] = free ? d : ''; if (free) used[d] = 1;
    });
    return out;
}
// The command a key runs now, or ''
function keyAt(keys, k) { var c = keyClean(k); if (!c || !keys) return ''; var ids = Object.keys(keys); for (var i = 0; i < ids.length; i++) if (keys[ids[i]] === c) return ids[i]; return ''; }

if (typeof window !== 'undefined') window.wpKeyCore = { keyOf: keyOf, keyClean: keyClean, keyName: keyName, APP_KEYS: APP_KEYS, keyRefusal: keyRefusal, keysClean: keysClean, keysNow: keysNow, keyAt: keyAt };
export { keyOf, keyClean, keyName, APP_KEYS, keyRefusal, keysClean, keysNow, keyAt };
