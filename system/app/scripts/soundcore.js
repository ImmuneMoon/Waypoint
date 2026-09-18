/* Sound & effects (1.5.0) — the pure half: limits, validators for what comes off the wire, the mix
   maths and the loop-seam blend. No DOM, no state: tools/soundcheck.js runs this under Node and
   sound.js (the engine, the panel, the library, the player side) imports it. Published as
   window.wpSoundCore when a window exists.

   The contract (docs/SOUND_PLAN.md §2, §4, §7, §13):
     cleanSoundList(list, opts)  the host's `sounds` list as a client stores it: at most 200 entries,
                                 ids unique, uploaded sounds only as /saves/images/audio/<campId>/<file>,
                                 bundled defaults only by id resolved against THIS install's manifest
                                 (a host never names an assets/ path), sizes under the caps, a summed
                                 size budget.
     cleanSoundCue(msg, list)    a `sound` cue: act in {ambient, cue, stop, volume}, ids only from the
                                 list, gain / fade clamped; the entry's own path is what gets fetched.
     mixGain(entry, master, local)  entry gain × the GM's master × this machine's volume, clamped.
     seamBlend(channels, rate)   equal-power blend of a loop's tail into its head (300 ms) on copies,
                                 and the loopEnd to use, so an ambient loops without a click. */
'use strict';

var VERSION = '1.5.0';
var LIMITS = {
    file: 4 * 1024 * 1024,        // one uploaded sound (docs §13 R1-1: chunked transfer, small cap, no WAV)
    campaign: 100 * 1024 * 1024,  // summed uploads per campaign, and the client's list budget
    entries: 200,
    loopSec: 120, cueSec: 30,     // a loop is capped by duration at upload; a cue is cut after 30 s
    overlap: 4,                   // simultaneous cues
    cacheSec: 900,                // decoded PCM kept, in seconds of audio
    prefetchBytes: 16 * 1024 * 1024,
    name: 60, seamSec: 0.3, part: 256 * 1024
};
var EXT_RE = /\.(mp3|ogg|oga|m4a|webm|opus)$/i;
var ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
var CTRL_RE = new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + String.fromCharCode(127) + ']');
var PATH_RE = /^\/saves\/images\/audio\/[A-Za-z0-9_-]{1,60}\/[^\/?#]{1,200}$/;

function safeId(s) { return String(s || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60); }
function num(v, lo, hi, dflt) { if (v === null || v === undefined || v === '') return dflt; v = Number(v); return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : dflt; }
function str(v, cap) { return typeof v === 'string' ? v.slice(0, cap) : ''; }
function isUploadPath(p) { return typeof p === 'string' && PATH_RE.test(p) && !CTRL_RE.test(p) && p.indexOf('..') < 0 && EXT_RE.test(p); }

// One entry as the client keeps it. opts.defaults: this install's manifest as { id: { name, file, kind, dur, size } }.
function cleanEntry(e, opts) {
    if (!e || typeof e !== 'object' || !ID_RE.test(String(e.id || ''))) return null;
    var out = { id: e.id, name: str(e.name, LIMITS.name) || e.id, kind: e.kind === 'loop' ? 'loop' : 'cue', gain: num(e.gain, 0.1, 2, 1), size: 0, dur: num(e.dur, 0, 3600, 0) };
    if (e.def === true) {
        var d = opts && opts.defaults && Object.prototype.hasOwnProperty.call(opts.defaults, e.id) ? opts.defaults[e.id] : null;
        if (!d) return null;                       // a default this install does not have: nothing to play, nothing to fetch
        out.def = true; out.path = 'assets/sounds/' + d.file; out.size = 0; out.dur = num(d.dur, 0, 3600, out.dur);
        if (!out.name || out.name === e.id) out.name = d.name || e.id;
        return out;
    }
    if (!isUploadPath(e.path)) return null;
    out.path = e.path;
    var sz = Number(e.size);
    if (!isFinite(sz) || sz < 0 || sz > LIMITS.file) return null;   // over the cap or unknown: never asked for (a clamp would fetch it anyway)
    out.size = Math.floor(sz);
    if (out.kind === 'loop' && out.dur > LIMITS.loopSec) out.kind = 'cue';   // a loop the host lied about plays once and stops
    return out;
}
function cleanSoundList(list, opts) {
    if (!Array.isArray(list)) return [];
    var out = [], seen = Object.create(null), bytes = 0;
    for (var i = 0; i < list.length && out.length < LIMITS.entries; i++) {
        var e = cleanEntry(list[i], opts);
        if (!e || seen[e.id]) continue;
        if (!e.def) { if (bytes + e.size > LIMITS.campaign) continue; bytes += e.size; }
        seen[e.id] = 1; out.push(e);
    }
    return out;
}
var ACTS = { ambient: 1, cue: 1, stop: 1, volume: 1 };
function cleanSoundCue(msg, list) {
    if (!msg || typeof msg !== 'object' || !ACTS[msg.act]) return null;
    var ids = Object.create(null); (Array.isArray(list) ? list : []).forEach(function(e) { if (e && e.id) ids[e.id] = 1; });
    var out = { act: msg.act, fade: num(msg.fade, 0, 5000, 0) };
    if (msg.act === 'ambient' || msg.act === 'cue') { if (!ids[msg.id]) return null; out.id = msg.id; out.gain = num(msg.gain, 0, 2, 1); return out; }
    if (msg.act === 'stop') { if (msg.id === 'ambient' || msg.id === 'all' || msg.id === undefined) out.id = msg.id || 'all'; else if (ids[msg.id]) out.id = msg.id; else return null; return out; }
    // volume: the host's master (no id) or one entry's gain
    out.gain = num(msg.gain, 0, 2, 1);
    if (msg.id !== undefined) { if (!ids[msg.id]) return null; out.id = msg.id; }
    return out;
}
function mixGain(entry, master, local) { return num(num(entry && entry.gain, 0.1, 2, 1) * num(master, 0, 2, 1) * num(local, 0, 1, 1), 0, 2, 0); }

// Loop seam: the last `seamSec` of every channel is blended into the first with equal-power gains on a
// copy, and the loop ends `seamSec` early — so the wrap lands inside the blended head. Pure Float32 maths.
function seamBlend(channels, rate, seamSec) {
    seamSec = seamSec || LIMITS.seamSec;
    var n = Math.floor(rate * seamSec), out = [], len = channels.length ? channels[0].length : 0;
    if (!len || n <= 0 || len < n * 3) return { channels: channels, loopEnd: 0 };   // too short to blend: loop as is
    for (var c = 0; c < channels.length; c++) {
        var src = channels[c], dst = new Float32Array(src.length); dst.set(src);
        for (var i = 0; i < n; i++) {
            var t = i / n, gIn = Math.sin(t * Math.PI / 2), gOut = Math.cos(t * Math.PI / 2);
            dst[i] = src[i] * gIn + src[len - n + i] * gOut;
        }
        out.push(dst);
    }
    return { channels: out, loopEnd: (len - n) / rate };
}

var API = { VERSION: VERSION, LIMITS: LIMITS, safeId: safeId, isUploadPath: isUploadPath, cleanEntry: cleanEntry, cleanSoundList: cleanSoundList, cleanSoundCue: cleanSoundCue, mixGain: mixGain, seamBlend: seamBlend, EXT_RE: EXT_RE };
if (typeof window !== 'undefined') window.wpSoundCore = API;
export { VERSION, LIMITS, safeId, isUploadPath, cleanEntry, cleanSoundList, cleanSoundCue, mixGain, seamBlend, EXT_RE };
