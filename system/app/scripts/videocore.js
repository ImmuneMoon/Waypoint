/* Campaign videos (1.5.0, backlog item 21) — the pure half: the campaign's video library as the GM keeps it, the only paths an
   uploaded video may have, the address a video element is given for one, and the words the Video panel shows. No DOM, no state:
   tools/videocheck.js runs it under Node, and video.js (the GM's Video panel) imports it. Published as window.wpVideoCore.

   camp.videos = [{ id: 'v_xxxxxxxx', name, path: '/saves/images/video/<campId>/<file>', size, dur?, w?, h? }]   GM-only: it never
   travels in the snapshot (net.js strips it). A video lives in the GM's saves folder; in a session it is streamed live to the table
   (V2), never sent as a file. */
'use strict';

var VERSION = '1.5.0';
var LIMITS = {
    videos: 100,          // entries in a campaign's library
    name: 60,             // a video's name, in characters
    file: 200,            // the file name on disk, in characters
    size: 1e12,           // bytes (a guard, not a cap: the GM's own disk is the limit)
    dur: 24 * 3600,       // seconds
    px: 16384             // a width or a height
};
var ID_RE = /^v_[a-z0-9]{8}$/;
var EXT_RE = /\.(mp4|m4v|webm|ogv|mov)$/i;
var CTRL_RE = new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + String.fromCharCode(127) + ']');
// the folder is a campaign id's safe form; the file name holds no separator, query, fragment, percent sign or space (video.js
// writes names that way), so the path is the same text on disk, in the save and, segment-encoded, in a video element's address
var PATH_RE = /^\/saves\/images\/video\/([A-Za-z0-9_-]{1,60})\/([^\/\\?#%\s]{1,200})$/;

function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function cut(s, n) { return Array.from(s).slice(0, n).join(''); }   // by code points: a cut never splits a surrogate pair
function safeId(s) { return String(s == null ? '' : s).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60); }
function isVideoPath(p) {
    if (typeof p !== 'string' || CTRL_RE.test(p)) return false;
    var m = PATH_RE.exec(p);
    return !!m && m[2].indexOf('..') < 0 && m[2].charAt(0) !== '.' && EXT_RE.test(m[2]);
}
// The address a video element plays: the same path with its file name percent-encoded (a name in any script reaches the local
// server, which decodes it), or '' for anything that is not an uploaded video's path
function videoSrc(p) {
    if (!isVideoPath(p)) return '';
    var m = PATH_RE.exec(p);
    return '/saves/images/video/' + m[1] + '/' + encodeURIComponent(m[2]);
}
function cleanName(v, dflt) {
    var s = typeof v === 'string' ? cut(v.replace(new RegExp(CTRL_RE.source, 'g'), ' ').replace(/\s+/g, ' ').trim(), LIMITS.name).trim() : '';
    return s || dflt;
}
function numIn(v, lo, hi) { return typeof v === 'number' && isFinite(v) && v >= lo && v <= hi ? v : null; }   // a number only (never a string or a boolean read as one)

// One entry: its id, name and path as they must be, its size in bytes; its length and picture size only when they are numbers in
// range. Null for anything else (never a web address, a path outside the video folder, a page or a script)
function cleanVideo(v) {
    if (!isObj(v) || typeof v.id !== 'string' || !ID_RE.test(v.id) || !isVideoPath(v.path)) return null;
    var size = numIn(v.size, 0, LIMITS.size); if (size === null) return null;
    var out = { id: v.id, name: cleanName(v.name, 'Video'), path: v.path, size: Math.floor(size) };
    var dur = numIn(v.dur, 0, LIMITS.dur); if (dur !== null && dur > 0) out.dur = Math.round(dur * 10) / 10;
    var w = numIn(v.w, 1, LIMITS.px), h = numIn(v.h, 1, LIMITS.px);
    if (w !== null && h !== null) { out.w = Math.floor(w); out.h = Math.floor(h); }
    return out;
}
// The whole library: entries that clean, an id once and a file once, at most LIMITS.videos, in their order
function cleanVideos(list) {
    var out = [], ids = Object.create(null), paths = Object.create(null);
    if (!Array.isArray(list)) return out;
    for (var i = 0; i < list.length && out.length < LIMITS.videos; i++) {
        var c = cleanVideo(list[i]); if (!c || ids[c.id] || paths[c.path]) continue;
        ids[c.id] = 1; paths[c.path] = 1; out.push(c);
    }
    return out;
}

// The name a file is uploaded under: its own name with every character a path could misread (a separator, ?, #, %, a space, a
// control character) as _, cut to 80 code points (with the server's prefix, well inside the path's 200), then its extension in
// lower case. '' for a file that is not a video by name
function diskName(fileName) {
    if (typeof fileName !== 'string') return '';
    var m = /^(.*)(\.(mp4|m4v|webm|ogv|mov))$/i.exec(fileName.trim()); if (!m) return '';
    var base = cut(m[1].replace(new RegExp(CTRL_RE.source, 'g'), '_').replace(/[\/\\?#%\s:*"<>|]+/g, '_').replace(/\.{2,}/g, '_').replace(/^[._]+/, ''), 80);
    return (base || 'video') + m[2].toLowerCase();
}
// The name an upload shows by default: the file's own name without its extension (and without the server's 8-character prefix)
function nameOf(fileName) { return cleanName(String(fileName == null ? '' : fileName).replace(/^[a-z0-9]{8}_/, '').replace(/\.[^.]+$/, ''), 'Video'); }
// A fresh id; rand() gives numbers in [0, 1) (Math.random in the app, a seeded one in the checks)
function newId(rand, taken) {
    var abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
    for (var tries = 0; tries < 50; tries++) {
        var s = 'v_'; for (var i = 0; i < 8; i++) s += abc.charAt(Math.floor(rand() * abc.length) % abc.length);
        if (!taken || !taken[s]) return s;
    }
    return null;
}
function fmtSize(b) {
    b = Number(b) || 0;
    if (b >= 1073741824) return (b / 1073741824).toFixed(b >= 10737418240 ? 0 : 1) + ' GB';
    if (b >= 1048576) return (b / 1048576).toFixed(b >= 104857600 ? 0 : 1) + ' MB';
    return Math.max(0, Math.round(b / 1024)) + ' KB';
}
function fmtDur(s) {
    s = Math.max(0, Math.round(Number(s) || 0));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return (h ? h + ':' + ('0' + m).slice(-2) : String(m)) + ':' + ('0' + sec).slice(-2);
}
// A library's line under the list: how many videos and how much of the disk they take
function sumLine(list) {
    var n = Array.isArray(list) ? list.length : 0, bytes = 0;
    for (var i = 0; i < n; i++) bytes += Number(list[i] && list[i].size) || 0;
    return n ? n + ' video' + (n === 1 ? '' : 's') + ' · ' + fmtSize(bytes) + ' in your saves folder' : 'No videos yet';
}

var API = { VERSION: VERSION, LIMITS: LIMITS, EXT_RE: EXT_RE, safeId: safeId, isVideoPath: isVideoPath, videoSrc: videoSrc, cleanName: cleanName, cleanVideo: cleanVideo, cleanVideos: cleanVideos, diskName: diskName, nameOf: nameOf, newId: newId, fmtSize: fmtSize, fmtDur: fmtDur, sumLine: sumLine };
if (typeof window !== 'undefined') window.wpVideoCore = API;
export { VERSION, LIMITS, EXT_RE, safeId, isVideoPath, videoSrc, cleanName, cleanVideo, cleanVideos, diskName, nameOf, newId, fmtSize, fmtDur, sumLine };
