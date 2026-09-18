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
    flashGapMs: 500         // the receiver's luminance floor between flashes / wash starts / boom bursts / shakes
});
var KINDS = { flash: 1, shake: 1, wash: 1, burst: 1, weather: 1, banner: 1, pulse: 1, stop: 1 };
var LOOKS = { burst: ['boom', 'magic', 'smoke', 'sparks'], weather: ['rain', 'snow', 'embers', 'haze'] };
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
    else if (fx.kind === 'burst') f.noParticles = true;
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

// The messages that re-create a map's running weather / held wash for a peer arriving on it (map switch, travel, admit, the stream query).
function runningSet(running, id) {
    var r = running && running[id]; if (!r) return [];
    var out = [];
    if (r.weather) out.push(withMap(r.weather, id));
    if (r.wash) out.push(withMap(r.wash, id));
    return out;
}
function withMap(fx, id) { var f = {}; for (var k in fx) if (Object.prototype.hasOwnProperty.call(fx, k)) f[k] = fx[k]; f.mapId = id; f.type = 'fx'; return f; }

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

var API = { VERSION: VERSION, LIMITS: LIMITS, KINDS: KINDS, LOOKS: LOOKS, PRESETS: PRESETS, cleanFx: cleanFx, reduced: reduced, allowFlash: allowFlash, bright: bright, brightKey: brightKey, runningSet: runningSet, codePoints: codePoints };
if (typeof window !== 'undefined') window.wpFxCore = API;
export { VERSION, LIMITS, KINDS, LOOKS, PRESETS, cleanFx, reduced, allowFlash, bright, brightKey, runningSet, codePoints };
