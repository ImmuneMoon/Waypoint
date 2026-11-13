/* Voice chat — the pure half: what a voice message may carry, each side's settings as they are kept, and the words the Voice panel
   shows. No DOM, no state: it can run under Node, and voice.js (the panel and the links) imports it. Published as window.wpVoiceCore.

   The shape of a table's voice (voice.js): the host is the hub. Each player in voice holds ONE WebRTC connection to the host, agreed
   over the table's own data connection (the way a shown video is), and the host is always the side that offers. The player's
   microphone goes up on the first audio line of it; every other voice (the GM's and the other players') comes down on lines the host
   adds, one per speaker, each line (by its mid) named in the offer's `who` map so the player knows whose it is. Nothing of it passes the
   signaling server. Mute, volume and push-to-talk are each person's own and never leave their machine. */
'use strict';

var VERSION = '0.1.0';
var LIMITS = {
    members: 16,      // voices in one table's voice at once (the host forwards every one to every other: keep it a table, not a hall)
    ice: 80,          // candidates one link takes, either way
    sdp: 30000,       // a session description's length (one line per speaker makes it grow)
    name: 40          // a speaker's name as shown
};
var LINK_ID = /^[0-9a-f]{16}$/;
var MID = /^[A-Za-z0-9_-]{1,16}$/;           // a media line's mid, as the engine writes it
var PID = /^[A-Za-z0-9_:.-]{1,80}$/;         // a profile id, as the roster keeps them (net.js validProfileId)
function isPid(k) { return typeof k === 'string' && PID.test(k) && !(k in Object.prototype); }

// One ICE candidate as it may travel: its line (one line, bounded) and the media line it belongs to; anything else is none
function cleanCand(c) {
    if (!c || typeof c !== 'object' || Array.isArray(c) || typeof c.candidate !== 'string' || c.candidate.length > 600 || c.candidate.indexOf('candidate:') !== 0 || /[\r\n\u0000]/.test(c.candidate)) return null;
    var out = { candidate: c.candidate };
    if (typeof c.sdpMid === 'string' && /^[A-Za-z0-9_-]{1,16}$/.test(c.sdpMid)) out.sdpMid = c.sdpMid;
    if (typeof c.sdpMLineIndex === 'number' && c.sdpMLineIndex >= 0 && c.sdpMLineIndex <= LIMITS.members + 2 && Math.floor(c.sdpMLineIndex) === c.sdpMLineIndex) out.sdpMLineIndex = c.sdpMLineIndex;
    return out.sdpMid !== undefined || out.sdpMLineIndex !== undefined ? out : null;
}
// A session description as it may travel: bounded text that starts as one does; anything else is none
function cleanSdp(s) { return typeof s === 'string' && s.length <= LIMITS.sdp && s.indexOf('v=0') === 0 ? s : null; }
function isLinkId(id) { return typeof id === 'string' && LINK_ID.test(id); }
function cleanName(v) {
    var s = typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f​‎‏‪-‮⁠-⁩﻿]/g, '').trim().slice(0, LIMITS.name) : '';
    return s || 'Player';
}
// The offer's map of whose voice each incoming line is: { mid: { pid, name, gm? } }, at most LIMITS.members entries; bad entries go
function cleanWho(w) {
    var out = Object.create(null), n = 0;
    if (!w || typeof w !== 'object' || Array.isArray(w)) return out;
    Object.keys(w).forEach(function(mid) {
        var e = w[mid];
        if (n >= LIMITS.members || !MID.test(mid) || !e || typeof e !== 'object' || !isPid(e.pid)) return;
        out[mid] = { pid: e.pid, name: cleanName(e.name), gm: e.gm === true };
        n++;
    });
    return out;
}

/* ---------- this machine's own settings (localStorage, never sent) ---------- */
var MODES = ['open', 'ptt'];
function cleanMode(m) { return MODES.indexOf(m) >= 0 ? m : 'open'; }
// A volume is a share of full, 0 to 1, in steps of a hundredth; anything else is full
function cleanVol(v) { var x = Number(v); return isFinite(x) ? Math.round(Math.max(0, Math.min(1, x)) * 100) / 100 : 1; }
// Per-speaker volumes and mutes, keyed by profile id: { pid: vol } and { pid: true }
function cleanVols(o) {
    var out = {}; if (!o || typeof o !== 'object' || Array.isArray(o)) return out;
    Object.keys(o).slice(0, 200).forEach(function(k) { if (isPid(k)) { var v = cleanVol(o[k]); if (v !== 1) out[k] = v; } });
    return out;
}
function cleanMutes(o) {
    var out = {}; if (!o || typeof o !== 'object' || Array.isArray(o)) return out;
    Object.keys(o).slice(0, 200).forEach(function(k) { if (isPid(k) && o[k] === true) out[k] = true; });
    return out;
}
// The push-to-talk bind: a keyboard code (KeyboardEvent.code) or a mouse button 'Mouse3'..'Mouse4' (the side buttons). Left, middle
// and right click never: the map needs them
function cleanBind(b) {
    if (typeof b !== 'string') return 'KeyV';
    if (/^Mouse[34]$/.test(b)) return b;
    if (/^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-9]|2[0-4])|Backquote|Backslash|BracketLeft|BracketRight|Semicolon|Quote|Comma|Period|Slash|Minus|Equal|CapsLock|Tab|Space|ShiftLeft|ShiftRight|ControlLeft|ControlRight|AltLeft|AltRight|Insert|Home|End|PageUp|PageDown|Pause|ScrollLock|Numpad[0-9]|NumpadAdd|NumpadSubtract|NumpadMultiply|NumpadDivide|NumpadDecimal|NumpadEnter)$/.test(b)) return b;
    return 'KeyV';
}
function bindLabel(b) {
    b = cleanBind(b);
    if (b === 'Mouse3') return 'Mouse back';
    if (b === 'Mouse4') return 'Mouse forward';
    var named = { Backquote: '`', Backslash: '\\', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Minus: '-', Equal: '=', CapsLock: 'Caps Lock', ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift', ControlLeft: 'Left Ctrl', ControlRight: 'Right Ctrl', AltLeft: 'Left Alt', AltRight: 'Right Alt', PageUp: 'Page Up', PageDown: 'Page Down', ScrollLock: 'Scroll Lock' };
    if (named[b]) return named[b];
    var m = /^(?:Key|Digit)(.)$/.exec(b); if (m) return m[1];
    m = /^Numpad(.+)$/.exec(b); if (m) return 'Num ' + m[1];
    return b;
}
// A chosen microphone or output device, as the engine names it (an opaque id, the same on this computer from one run to the next);
// '' is the system's default. Anything else is the default
function cleanDeviceId(id) { return typeof id === 'string' && id.length <= 256 && /^[A-Za-z0-9+\/=_.:-]*$/.test(id) && id !== 'default' ? id : ''; }
// The devices of one kind as the pickers list them: [{ id, name }], the system's own 'default' entry left out (the picker has its
// own "System default"), a device with no name yet (before the microphone is allowed the engine gives none) named by its place
function deviceList(devices, kind) {
    var out = [], n = 0;
    (Array.isArray(devices) ? devices : []).forEach(function(d) {
        if (!d || d.kind !== kind || typeof d.deviceId !== 'string' || d.deviceId === 'default' || !d.deviceId) return;
        var id = cleanDeviceId(d.deviceId); if (!id || out.some(function(o) { return o.id === id; })) return;
        n++;
        var label = typeof d.label === 'string' ? d.label.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80) : '';
        out.push({ id: id, name: label || (kind === 'audioinput' ? 'Microphone ' : 'Speakers ') + n });
    });
    return out;
}
// What a mouse button number is as a bind, or null (only the two side buttons)
function mouseBind(button) { return button === 3 ? 'Mouse3' : button === 4 ? 'Mouse4' : null; }

/* ---------- the words ---------- */
// A level meter's reading (0..1, RMS of the time-domain samples) as speaking or not; a little hysteresis is the caller's
function speaking(rms) { return typeof rms === 'number' && rms > 0.02; }
function stateWords(s) {   // s: { joined, joining, muted, deaf, mode, talking, error }
    if (s.error) return s.error;
    if (s.joining) return 'Connecting…';
    if (!s.joined) return 'Not in voice';
    if (s.deaf) return 'Deafened';
    if (s.muted) return 'Muted';
    if (s.mode === 'ptt') return s.talking ? 'Talking' : 'Push to talk — hold ' + bindLabel(s.bind);
    return 'Voice connected';
}

var API = { VERSION: VERSION, LIMITS: LIMITS, cleanCand: cleanCand, cleanSdp: cleanSdp, isLinkId: isLinkId, cleanName: cleanName, cleanWho: cleanWho, cleanMode: cleanMode, cleanVol: cleanVol, cleanVols: cleanVols, cleanMutes: cleanMutes, cleanBind: cleanBind, bindLabel: bindLabel, cleanDeviceId: cleanDeviceId, deviceList: deviceList, mouseBind: mouseBind, speaking: speaking, stateWords: stateWords };
if (typeof window !== 'undefined') window.wpVoiceCore = API;
export { VERSION, LIMITS, cleanCand, cleanSdp, isLinkId, cleanName, cleanWho, cleanMode, cleanVol, cleanVols, cleanMutes, cleanBind, bindLabel, cleanDeviceId, deviceList, mouseBind, speaking, stateWords };
