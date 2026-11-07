/* Visual effects (1.5.0, S3) — the pure half: the limits, the presets, the validator for what the GM sends and
   what a player receives (a flash, shake, wash, burst, weather, banner, token pulse or a stop), the reduced-motion
   transform, and the "what is running on this map" replay for a late joiner. No DOM, no state, no engine import,
   so tools/fxcheck.js runs it under Node. Published as window.wpFxCore. Design of record: docs/VISUAL_FX_PLAN.md. */
'use strict';

var VERSION = '1.5.0';
var LIMITS = Object.freeze({
    ms: { flash: [120, 600], shake: [200, 1200], wash: [300, 10000], banner: [1000, 8000], burst: [300, 3000] },
    amp: [2, 24],           // shake pixels
    r: [20, 6000],          // burst radius in board pixels
    text: 60,               // banner characters (code points)
    alpha: [0.2, 0.95],     // wash opacity
    density: [0.2, 1],      // weather thickness
    board: 30000,           // the whiteboard is 30000 x 30000
    mapId: 80,
    flashGapMs: 500,        // the receiver's luminance floor between flashes / wash starts / boom bursts / shakes
    pingLive: 8,            // the GM's pings (fold P): at most this many drawn at once on a map, the oldest taken away
    pingGapMs: 200          // and one that comes sooner than this after the last one drawn is ignored
});
var KINDS = { flash: 1, shake: 1, wash: 1, burst: 1, weather: 1, banner: 1, pulse: 1, stop: 1 };
var LOOKS = { burst: ['boom', 'magic', 'smoke', 'sparks', 'ping'], weather: ['rain', 'snow', 'embers', 'haze'] };   // a ping is a look, never a preset: its own controls send it
var STOP_WHAT = { wash: 1, weather: 1, all: 1 };
var COLOR_RE = /^#[0-9a-f]{6}$/i;
var TOK_RE = /^wb[A-Za-z0-9_]{1,40}$/;
var CTRL_RE = new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + String.fromCharCode(127) + ']');
var DEFAULT_COLOR = { flash: '#ffffff', wash: '#000000' };
var DEFAULT_MS = { flash: 300, shake: 600, wash: 4000, banner: 2500, burst: 900 };   // when a message omits ms (the panel always sends it)

function isObj(v) { return v !== null && typeof v === 'object'; }
function fin(v) { return typeof v === 'number' && isFinite(v); }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function codePoints(s) { var n = 0; for (var i = 0; i < s.length; i++) { n++; var c = s.charCodeAt(i); if (c >= 0xD800 && c <= 0xDBFF) i++; } return n; }
function color(v, kind) {   // '' -> the kind's default (or undefined); a bad string -> null (refuse)
    if (v === undefined || v === null || v === '') return DEFAULT_COLOR[kind] || '';
    return typeof v === 'string' && COLOR_RE.test(v) ? v.toLowerCase() : null;
}
function msIn(v, kind) { var r = LIMITS.ms[kind]; if (!fin(Number(v))) return DEFAULT_MS[kind] || r[0]; return clamp(Math.round(Number(v)), r[0], r[1]); }
function rangeIn(v, r, dflt) { var n = Number(v); if (!fin(n)) return dflt; return clamp(n, r[0], r[1]); }
function mapId(v) { return typeof v === 'string' && v && v.length <= LIMITS.mapId && !CTRL_RE.test(v) ? v : null; }

// One message from the GM (or from the host's own play), cleaned to exactly the fields a kind carries, or null to refuse.
function cleanFx(msg) {
    if (!isObj(msg) || typeof msg.kind !== 'string' || !KINDS[msg.kind]) return null;
    var k = msg.kind;
    if (k === 'stop') { var w = STOP_WHAT[msg.what] ? msg.what : 'all'; return { kind: 'stop', what: w }; }
    var m = mapId(msg.mapId); if (!m) return null;   // every visible effect belongs to a map
    var out = { kind: k, mapId: m };
    if (k === 'flash') { out.color = color(msg.color, 'flash'); if (out.color === null) return null; out.ms = msIn(msg.ms, 'flash'); return out; }
    if (k === 'shake') { out.ms = msIn(msg.ms, 'shake'); out.amp = Math.round(rangeIn(msg.amp, LIMITS.amp, 10)); return out; }
    if (k === 'wash') {
        out.color = color(msg.color, 'wash'); if (out.color === null) return null;
        out.alpha = rangeIn(msg.alpha, LIMITS.alpha, 0.7);
        if (msg.hold === true) out.hold = true; else out.ms = msIn(msg.ms, 'wash');
        return out;
    }
    if (k === 'burst') {
        if (!fin(Number(msg.x)) || !fin(Number(msg.y))) return null;
        var x = Number(msg.x), y = Number(msg.y);
        if (x < 0 || x > LIMITS.board || y < 0 || y > LIMITS.board) return null;   // a clamped burst would land where the GM did not click
        if (LOOKS.burst.indexOf(msg.look) < 0) return null;
        out.x = x; out.y = y; out.look = msg.look; out.r = Math.round(rangeIn(msg.r, LIMITS.r, 120)); out.ms = msIn(msg.ms, 'burst');
        var bc = color(msg.color, 'burst'); if (bc === null) return null; if (bc) out.color = bc;
        return out;
    }
    if (k === 'weather') { if (LOOKS.weather.indexOf(msg.look) < 0) return null; out.look = msg.look; out.density = rangeIn(msg.density, LIMITS.density, 0.6); return out; }
    if (k === 'banner') {
        if (typeof msg.text !== 'string' || CTRL_RE.test(msg.text) || codePoints(msg.text) > LIMITS.text) return null;
        out.text = msg.text.trim(); if (!out.text) return null;
        out.ms = msIn(msg.ms, 'banner');
        var nc = color(msg.color, 'banner'); if (nc === null) return null; if (nc) out.color = nc;
        return out;
    }
    if (k === 'pulse') { if (!TOK_RE.test(msg.tok)) return null; out.tok = msg.tok; var pc = color(msg.color, 'pulse'); if (pc === null) return null; if (pc) out.color = pc; return out; }
    return null;
}

// The same effect adjusted for a viewer who asked for less motion (the OS query or the app's Reduce-motion switch).
function reduced(fx, on) {
    if (!on || !fx) return fx;
    if (fx.kind === 'shake') return null;
    var f = {}; for (var key in fx) if (Object.prototype.hasOwnProperty.call(fx, key)) f[key] = fx[key];
    if (fx.kind === 'flash') { f.ms = Math.min(f.ms, 150); f.dim = true; }
    else if (fx.kind === 'burst') { f.noParticles = true; if (fx.look === 'ping') f.still = true; }   // a ping: a still ring that fades, never a pulse
    else if (fx.kind === 'weather') f.density = Math.max(LIMITS.density[0], f.density / 2);
    return f;
}

// A receiver's photosensitivity gate (WCAG 2.3.1): a bright luminance jump — a flash, or a boom burst — is dropped
// when the SAME kind fired within flashGapMs, so a strobe never forms. A flash then a boom is fine (different kinds);
// a wash (a gentle fade) and a shake (motion, handled by reduced-motion) are never gated. `last` is a per-key map
// { flash, boom } of the previous accepted times; the clock is passed in, so this stays pure.
function brightKey(fx) { if (!fx) return null; if (fx.kind === 'flash') return 'flash'; if (fx.kind === 'burst' && fx.look === 'boom') return 'boom'; return null; }
function bright(fx) { return brightKey(fx) !== null; }
function allowFlash(fx, last, now) { var k = brightKey(fx); if (!k) return true; var t = last && last[k]; return !fin(t) || (now - t) >= LIMITS.flashGapMs; }

// A receiver's bound on the GM's pings (fold P). `live` is the start times of the pings still drawn on the map, oldest
// first; the clock is passed in. -1: ignore this one (it came sooner than pingGapMs after the last one drawn); otherwise
// how many of the oldest to take away first, so that no more than pingLive are ever drawn at once.
function pingAdmit(live, now) {
    var n = Array.isArray(live) ? live.length : 0, last = n ? live[n - 1] : null;
    if (fin(last) && now - last < LIMITS.pingGapMs) return -1;
    return Math.max(0, n + 1 - LIMITS.pingLive);
}

// The messages that re-create a map's running weather / held wash for a peer arriving on it (map switch, travel, admit, the stream query).
function runningSet(running, id) {
    var r = running && running[id]; if (!r) return [];
    var out = [];
    if (r.weather) out.push(withMap(r.weather, id));
    if (r.wash) out.push(withMap(r.wash, id));
    return out;
}
function withMap(fx, id) { var f = {}; for (var k in fx) if (Object.prototype.hasOwnProperty.call(fx, k)) f[k] = fx[k]; f.mapId = id; f.type = 'fx'; return f; }

// Saved effects (1.6.2, backlog 81 and 99; the owner's answers of 2026-11-07): what the GM has running, kept by name in the campaign. The
// weather with its density, the colour held on the screen and up to three loops of the Sound panel, each at its own volume. A map may name
// one to start when it is opened (its meta's fxEffect). Read through these alone: a campaign from a file holds whatever it holds
var SAVED = Object.freeze({ count: 24, name: 40, loops: 3 });
var SAVED_ID = /^se_[a-z0-9]{1,16}$/, LOOP_ID = /^[A-Za-z0-9_-]{1,40}$/;
function savedName(v) { if (typeof v !== 'string') return ''; var s = ''; for (var i = 0; i < v.length; i++) { var c = v.charCodeAt(i); s += c < 32 || c === 127 ? ' ' : v.charAt(i); } s = s.replace(/\s+/g, ' ').trim(); var out = '', n = 0; for (var j = 0; j < s.length && n < SAVED.name; j++) { var cc = s.charCodeAt(j); out += s.charAt(j); if (cc >= 0xD800 && cc <= 0xDBFF && j + 1 < s.length) { out += s.charAt(++j); } n++; } return out.trim(); }
function cleanSavedOne(s) {
    if (!isObj(s) || typeof s.id !== 'string' || !SAVED_ID.test(s.id)) return null;
    var name = savedName(s.name); if (!name) return null;
    var out = { id: s.id, name: name };
    if (isObj(s.weather) && LOOKS.weather.indexOf(s.weather.look) >= 0) out.weather = { look: s.weather.look, density: Math.round(rangeIn(s.weather.density, LIMITS.density, 0.6) * 100) / 100 };
    if (isObj(s.wash)) { var c = color(s.wash.color, 'wash'); if (c) out.wash = { color: c, alpha: Math.round(rangeIn(s.wash.alpha, LIMITS.alpha, 0.7) * 100) / 100 }; }
    if (Array.isArray(s.loops)) {
        var seen = Object.create(null), ls = [];
        for (var i = 0; i < s.loops.length && i < 16 && ls.length < SAVED.loops; i++) { var l = s.loops[i]; if (!isObj(l) || typeof l.id !== 'string' || !LOOP_ID.test(l.id) || seen[l.id]) continue; seen[l.id] = 1; ls.push({ id: l.id, vol: Math.round(rangeIn(l.vol, [0, 1], 1) * 100) / 100 }); }
        if (ls.length) out.loops = ls;
    }
    return out.weather || out.wash || out.loops ? out : null;
}
function cleanSaved(list) {
    if (!Array.isArray(list)) return [];
    var out = [], seen = Object.create(null);
    for (var i = 0; i < list.length && i < 200 && out.length < SAVED.count; i++) { var s = cleanSavedOne(list[i]); if (!s || seen[s.id]) continue; seen[s.id] = 1; out.push(s); }
    return out;
}
// A saved effect made from what runs: st { weather, wash } as the panel reads the map on screen, loops [{ id, vol }] from the Sound panel
function savedMake(st, loops, name, id) {
    var w = st && st.weather, h = st && st.wash;
    return cleanSavedOne({ id: id, name: name, weather: w ? { look: w.look, density: w.density } : null, wash: h ? { color: h.color, alpha: h.alpha } : null, loops: loops });
}
// The messages that show a saved effect on a map: its weather, and its colour held until cleared
function savedFx(s, mapId) {
    var out = []; if (!s || !mapId) return out;
    if (s.weather) out.push({ kind: 'weather', mapId: mapId, look: s.weather.look, density: s.weather.density });
    if (s.wash) out.push({ kind: 'wash', mapId: mapId, color: s.wash.color, alpha: s.wash.alpha, hold: true });
    return out;
}
// Whether a saved effect is what runs: every part of it, on the map on screen (st) and in the Sound panel (playing: the loop ids that play)
function savedOn(s, st, playing) {
    if (!s) return false;
    var w = st && st.weather, h = st && st.wash, p = Array.isArray(playing) ? playing : [];
    if (s.weather && !(w && w.look === s.weather.look && Math.abs((Number(w.density) || 0) - s.weather.density) < 0.011)) return false;
    if (s.wash && !(h && h.color === s.wash.color && Math.abs((Number(h.alpha) || 0) - s.wash.alpha) < 0.011)) return false;
    return !(s.loops || []).some(function(l) { return p.indexOf(l.id) < 0; });
}
// The saved effect a map starts with, or null: its meta names one of the campaign's by id
function savedFor(map, list) { var id = map && isObj(map.meta) && typeof map.meta.fxEffect === 'string' ? map.meta.fxEffect : ''; if (!id) return null; var l = cleanSaved(list); for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }

// The ✨ panel's buttons, as data. mapId (and, for a burst, x/y) are filled by the panel at click time.
var PRESETS = [
    { id: 'flash', label: 'Flash', row: 'screen', fx: { kind: 'flash', color: '#ffffff', ms: 300 } },
    { id: 'shake', label: 'Shake', row: 'screen', fx: { kind: 'shake', ms: 600, amp: 12 } },
    { id: 'wash-dark', label: 'Darkness', row: 'screen', fx: { kind: 'wash', color: '#000000', alpha: 0.8, hold: true } },
    { id: 'wash-red', label: 'Red mist', row: 'screen', fx: { kind: 'wash', color: '#a01010', alpha: 0.5, hold: true } },
    { id: 'wash-light', label: 'Blinding', row: 'screen', fx: { kind: 'wash', color: '#ffffff', alpha: 0.85, hold: true } },
    { id: 'burst-boom', label: 'Boom', row: 'burst', fx: { kind: 'burst', look: 'boom', r: 160, ms: 900 } },
    { id: 'burst-magic', label: 'Magic', row: 'burst', fx: { kind: 'burst', look: 'magic', r: 160, ms: 1100 } },
    { id: 'burst-smoke', label: 'Smoke', row: 'burst', fx: { kind: 'burst', look: 'smoke', r: 200, ms: 2600 } },
    { id: 'burst-sparks', label: 'Sparks', row: 'burst', fx: { kind: 'burst', look: 'sparks', r: 140, ms: 900 } },
    { id: 'weather-rain', label: 'Rain', row: 'weather', fx: { kind: 'weather', look: 'rain', density: 0.6 } },
    { id: 'weather-snow', label: 'Snow', row: 'weather', fx: { kind: 'weather', look: 'snow', density: 0.6 } },
    { id: 'weather-embers', label: 'Embers', row: 'weather', fx: { kind: 'weather', look: 'embers', density: 0.5 } },
    { id: 'weather-haze', label: 'Haze', row: 'weather', fx: { kind: 'weather', look: 'haze', density: 0.5 } }
];

var API = { VERSION: VERSION, LIMITS: LIMITS, KINDS: KINDS, LOOKS: LOOKS, PRESETS: PRESETS, cleanFx: cleanFx, reduced: reduced, allowFlash: allowFlash, pingAdmit: pingAdmit, bright: bright, brightKey: brightKey, runningSet: runningSet, codePoints: codePoints, SAVED: SAVED, cleanSaved: cleanSaved, cleanSavedOne: cleanSavedOne, savedMake: savedMake, savedFx: savedFx, savedOn: savedOn, savedFor: savedFor };
if (typeof window !== 'undefined') window.wpFxCore = API;
export { VERSION, LIMITS, KINDS, LOOKS, PRESETS, cleanFx, reduced, allowFlash, pingAdmit, bright, brightKey, runningSet, codePoints, SAVED, cleanSaved, cleanSavedOne, savedMake, savedFx, savedOn, savedFor };
