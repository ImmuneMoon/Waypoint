/* Music (1.5.0) — the pure half: limits and validators for named playlists, a per-map playback config, and
   the GM's "take control" override message that rides the wire. No DOM, no state, no audio: tools/musiccheck.js
   runs this under Node, and music.js (the engine, the GM panel, the player controls) imports it. Published as
   window.wpMusicCore when a window exists.

   Music is a VTT feature separate from `sound` (its own on/off + its own volume): it reuses the SOUND library
   (camp.sounds tracks + the uploaded-audio store + net.fetchAsset) for the actual files, and only adds the
   playlist / per-map / override layer here. Design of record: [[waypoint-music-playlist]].

   The shapes:
     camp.music = { v:1, tracks:[{ id, name, path, size, dur }], playlists:[{ id, name, tracks:[trackId] }] }   GM-only
     map.music  = { playlist:id|null, track:id|null, loop:'off'|'one'|'list', shuffle:bool }   a map's remembered auto-play
     control    = { on, playlist|track, loop, shuffle, playing, index, pos, ts, vol? }   the GM's live override (M3 wire)

   Music has its OWN track store (songs are far bigger and longer than SFX): its own upload folder entries and its
   own caps, segregated from the Sound library. Tracks reuse the audio upload path + net.fetchAsset transfer. */
'use strict';
import { isUploadPath } from './soundcore.js';

var VERSION = '1.5.0';
var LIMITS = {
    playlists: 50,        // named playlists per campaign
    trackDefs: 500,       // distinct tracks in a campaign's music library
    tracks: 200,          // track references in one playlist (repeats allowed — a playlist may list a track twice)
    file: 25 * 1024 * 1024,          // one music track (a full song); larger than an SFX (soundcore caps SFX at 4 MB)
    campaign: 2 * 1024 * 1024 * 1024, // summed music uploads per campaign (a guard, not a target)
    dur: 24 * 3600,       // a track's / seek position's seconds (a full day; guards against absurd values)
    name: 60,
    pos: 24 * 3600,       // a seek position in seconds
    index: 4096           // a track index within a playlist/override queue
};
var ID_RE = /^[A-Za-z0-9_-]{1,40}$/;   // a track / playlist id
var CTRL_RE = new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + String.fromCharCode(127) + ']');
var LOOP = { off: 1, one: 1, list: 1 };

function str(v, cap) { return typeof v === 'string' ? v.slice(0, cap) : ''; }
function num(v, lo, hi, dflt) { if (v === null || v === undefined || v === '') return dflt; v = Number(v); return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : dflt; }
function isId(v) { return typeof v === 'string' && ID_RE.test(v); }
function cleanName(v, dflt) { var s = str(v, LIMITS.name).replace(CTRL_RE, ' ').trim(); return s || dflt; }
function cleanLoop(v) { return LOOP[v] ? v : 'list'; }   // a map/override with music running defaults to looping the list

// One playlist. opts.trackIds (optional): a set { id: 1 } of the track ids that actually exist — when given, tracks
// not in it are dropped (so a client never keeps a reference to a track it will never receive). Repeats are kept.
function cleanPlaylist(p, opts) {
    if (!p || typeof p !== 'object' || !isId(p.id)) return null;
    var have = opts && opts.trackIds, tracks = [], src = Array.isArray(p.tracks) ? p.tracks : [];
    for (var i = 0; i < src.length && tracks.length < LIMITS.tracks; i++) { var t = src[i]; if (!isId(t)) continue; if (have && !have[t]) continue; tracks.push(t); }
    return { id: p.id, name: cleanName(p.name, 'Playlist'), tracks: tracks };
}
// One track in the campaign's music library: an uploaded song under /saves/images/audio/<campId>/, sized under the cap.
function cleanTrack(t) {
    if (!t || typeof t !== 'object' || !isId(t.id) || !isUploadPath(t.path)) return null;
    var sz = Number(t.size); if (!isFinite(sz) || sz < 0 || sz > LIMITS.file) return null;   // over the cap: never fetched
    return { id: t.id, name: cleanName(t.name, 'Track'), path: t.path, size: Math.floor(sz), dur: num(t.dur, 0, LIMITS.dur, 0) };
}
// camp.music as stored, or as a client receives it: the track store (deduped, size-budgeted) then the playlists,
// whose track references are filtered to the tracks that survived (so a playlist never points at a missing track).
function cleanMusic(music) {
    var out = { v: 1, tracks: [], playlists: [] };
    if (!music || typeof music !== 'object') return out;
    var seenT = Object.create(null), bytes = 0;
    (Array.isArray(music.tracks) ? music.tracks : []).forEach(function(t) {
        if (out.tracks.length >= LIMITS.trackDefs) return;
        var c = cleanTrack(t); if (!c || seenT[c.id]) return;
        if (bytes + c.size > LIMITS.campaign) return; bytes += c.size;
        seenT[c.id] = 1; out.tracks.push(c);
    });
    var seen = Object.create(null);
    (Array.isArray(music.playlists) ? music.playlists : []).forEach(function(p) {
        if (out.playlists.length >= LIMITS.playlists) return;
        var pl = cleanPlaylist(p, { trackIds: seenT }); if (!pl || seen[pl.id]) return;
        seen[pl.id] = 1; out.playlists.push(pl);
    });
    return out;
}
// A map's remembered playback config. Null when it names neither a playlist nor a track (nothing to auto-play).
// opts.playlistIds / opts.trackIds (optional): sets to validate the references exist.
function cleanMapMusic(m, opts) {
    if (!m || typeof m !== 'object') return null;
    var out = { loop: cleanLoop(m.loop), shuffle: m.shuffle === true };
    var pls = opts && opts.playlistIds, trs = opts && opts.trackIds;
    if (isId(m.playlist) && (!pls || pls[m.playlist])) out.playlist = m.playlist;
    else if (isId(m.track) && (!trs || trs[m.track])) out.track = m.track;
    else return null;   // a dangling reference (or none) means no auto-play, not a broken object
    return out;
}
// The GM's live "take control" override, as it rides the wire and as a client applies it. `on:false` releases control.
// playlist XOR track names what plays; playing/index/pos/ts let a client resume in sync; vol (optional) forces volume.
function cleanControl(msg, opts) {
    if (!msg || typeof msg !== 'object') return null;
    if (msg.on !== true) return { on: false };   // release: nothing else matters
    var out = { on: true, loop: cleanLoop(msg.loop), shuffle: msg.shuffle === true, playing: msg.playing !== false };
    var pls = opts && opts.playlistIds, trs = opts && opts.trackIds;
    if (isId(msg.playlist) && (!pls || pls[msg.playlist])) out.playlist = msg.playlist;
    else if (isId(msg.track) && (!trs || trs[msg.track])) out.track = msg.track;
    else return null;
    out.index = Math.floor(num(msg.index, 0, LIMITS.index, 0));
    out.pos = num(msg.pos, 0, LIMITS.pos, 0);
    out.ts = num(msg.ts, 0, 8.64e15, 0);   // the host clock at which pos was true, so a client can advance it
    if (msg.vol !== undefined && msg.vol !== null) out.vol = num(msg.vol, 0, 1, 1);   // a forced master volume (0..1), else players keep their own
    return out;
}

var API = { VERSION: VERSION, LIMITS: LIMITS, cleanName: cleanName, cleanLoop: cleanLoop, cleanTrack: cleanTrack, cleanPlaylist: cleanPlaylist, cleanMusic: cleanMusic, cleanMapMusic: cleanMapMusic, cleanControl: cleanControl };
if (typeof window !== 'undefined') window.wpMusicCore = API;
export { VERSION, LIMITS, cleanName, cleanLoop, cleanTrack, cleanPlaylist, cleanMusic, cleanMapMusic, cleanControl };
