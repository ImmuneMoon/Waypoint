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
import { isUploadPath, safeId } from './soundcore.js';

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
    if (isId(msg.now) && (!trs || trs[msg.now])) out.now = msg.now;   // the exact track playing now (within a playlist) — the client follows this id, not the index (survives shuffle)
    out.index = Math.floor(num(msg.index, 0, LIMITS.index, 0));
    out.pos = num(msg.pos, 0, LIMITS.pos, 0);
    out.ts = num(msg.ts, 0, 8.64e15, 0);   // the host clock at which pos was true, so a client can advance it
    if (msg.vol !== undefined && msg.vol !== null) out.vol = num(msg.vol, 0, 1, 1);   // a forced master volume (0..1), else players keep their own
    return out;
}

/* ---- music from another campaign (by reference: this campaign lists the other one's files, nothing is copied) ---- */
// The folder an uploaded track lies in (/saves/images/audio/<folder>/<file>), '' for anything else
function folderOf(p) { var m = /^\/saves\/images\/audio\/([A-Za-z0-9_-]{1,60})\//.exec(typeof p === 'string' ? p : ''); return m ? m[1] : ''; }
// True for a track whose file lies in another campaign's folder: one that was brought in, not uploaded here
function isRefPath(campId, p) { return folderOf(p) !== safeId(campId); }
// An id no entry holds: t_ + six letters and digits for a track, pl_ for a playlist. taken: { id: 1 }; '' if none is found in 50 tries
function newId(taken, kind, rand) {
    var r = typeof rand === 'function' ? rand : Math.random, pre = kind === 'playlist' ? 'pl_' : 't_';
    for (var i = 0; i < 50; i++) { var id = pre + (r().toString(36).slice(2, 8) || '0'); if (isId(id) && !taken[id]) return id; }
    return '';
}
// The stored music as the app reads it: entries that are objects, playlists whose tracks are a list (music.js campMusic reads the
// same way; the panel shows and the table is sent nothing else), then cleaned. A music that is no plain object is none.
function musicView(m) {
    var isObj = function(x) { return !!x && typeof x === 'object'; };
    if (!isObj(m) || Array.isArray(m)) return cleanMusic(null);
    return cleanMusic({ tracks: Array.isArray(m.tracks) ? m.tracks.filter(isObj) : [], playlists: Array.isArray(m.playlists) ? m.playlists.filter(function(p) { return isObj(p) && Array.isArray(p.tracks); }) : [] });
}
// Every id the stored music holds (a track's, a playlist's) and every id one of its playlists names, as { id: 1 }: a new id is none of them
function storedIds(m) {
    var t = Object.create(null), p = Object.create(null), all = Object.create(null), ok = m && typeof m === 'object' && !Array.isArray(m);
    (ok && Array.isArray(m.tracks) ? m.tracks : []).forEach(function(x) { if (x && typeof x === 'object' && typeof x.id === 'string') { t[x.id] = 1; all[x.id] = 1; } });
    (ok && Array.isArray(m.playlists) ? m.playlists : []).forEach(function(x) {
        if (!x || typeof x !== 'object') return;
        if (typeof x.id === 'string') { p[x.id] = 1; all[x.id] = 1; }
        (Array.isArray(x.tracks) ? x.tracks : []).forEach(function(r) { if (typeof r === 'string') all[r] = 1; });
    });
    return { tracks: t, playlists: p, all: all };
}
// What bringing playlists and tracks in from another campaign's music adds to this one: new entries only, nothing here changed.
//   dst, src: camp.music as stored (the source is cleaned first — a campaign from a file may hold anything)
//   pick: { playlists: [id], tracks: [id] } names the source's entries; a picked playlist comes with its tracks, in its order
//   opts.rand: for newId
// A track whose path this campaign already lists (as the app reads its music) is that track: nothing is added and a brought playlist
// points at it. Each new track is the source's with a new id — the same path. The caps are cleanMusic's own, counted as it counts,
// so what is stored is what players are sent; a track past them is left out (skipped) and a playlist keeps the tracks that came
// (one none of whose tracks came is left out too).
// A playlist this campaign already has (the same name over the same tracks) is not added again. A new id is never one this
// campaign's stored music holds or names. -> { tracks: [...], playlists: [...], reused, skipped, ids: { tracks, playlists } } where
// ids maps a source id to the id that entry has in this campaign afterwards (absent for one that did not come)
function bringPlan(dst, src, pick, opts) {
    var out = { tracks: [], playlists: [], reused: 0, skipped: 0, ids: { tracks: Object.create(null), playlists: Object.create(null) } };
    var d = musicView(dst), s = cleanMusic(src), taken = storedIds(dst).all, rand = opts && opts.rand;
    var byPath = Object.create(null), bytes = 0, nTracks = d.tracks.length, nPl = d.playlists.length;
    d.tracks.forEach(function(t) { if (!byPath[t.path]) byPath[t.path] = t.id; bytes += t.size; });
    var sTrack = Object.create(null), sPl = Object.create(null);
    s.tracks.forEach(function(t) { sTrack[t.id] = t; }); s.playlists.forEach(function(p) { sPl[p.id] = p; });
    var wanted = function(list, from) { var seen = Object.create(null), r = []; (Array.isArray(list) ? list : []).forEach(function(id) { if (isId(id) && !seen[id] && from[id]) { seen[id] = 1; r.push(from[id]); } }); return r; };
    var here = Object.create(null);   // a source track's id -> its id in this campaign ('' when it could not come)
    var bring = function(t) {
        if (here[t.id] !== undefined) return here[t.id];
        if (byPath[t.path]) { out.reused++; return (here[t.id] = byPath[t.path]); }
        if (nTracks >= LIMITS.trackDefs || bytes + t.size > LIMITS.campaign) { out.skipped++; return (here[t.id] = ''); }
        var id = newId(taken, 'track', rand); if (!id) { out.skipped++; return (here[t.id] = ''); }
        taken[id] = 1; byPath[t.path] = id; bytes += t.size; nTracks++;
        out.tracks.push({ id: id, name: t.name, path: t.path, size: t.size, dur: t.dur });
        return (here[t.id] = id);
    };
    wanted(pick && pick.playlists, sPl).forEach(function(p) {
        var ids = []; p.tracks.forEach(function(tid) { var id = bring(sTrack[tid]); if (id) ids.push(id); });
        if (p.tracks.length && !ids.length) { out.skipped++; return; }   // none of its tracks could come: no empty shell of it
        var same = d.playlists.concat(out.playlists).filter(function(q) { return q.name === p.name && q.tracks.length === ids.length && q.tracks.every(function(x, i) { return x === ids[i]; }); })[0];
        if (same) { out.ids.playlists[p.id] = same.id; return; }
        if (nPl >= LIMITS.playlists) { out.skipped++; return; }
        var id = newId(taken, 'playlist', rand); if (!id) { out.skipped++; return; }
        taken[id] = 1; nPl++; out.ids.playlists[p.id] = id;
        out.playlists.push({ id: id, name: p.name, tracks: ids });
    });
    wanted(pick && pick.tracks, sTrack).forEach(bring);
    Object.keys(here).forEach(function(k) { if (here[k]) out.ids.tracks[k] = here[k]; });
    return out;
}

// A file's music merged into a campaign already here (the file is another copy of this campaign): by id, as the rest of a merge
// goes. A song or a playlist of the file whose id this campaign holds is that entry, updated (its name, its file, its songs); one
// with a new id is added under that id — a song whose file this campaign already lists under another id is that song instead, and
// an id this campaign uses for the other kind of entry is changed for a new one. Nothing else here is touched, so the same file
// merged twice changes nothing the second time. The caps are cleanMusic's own; what does not fit is left out (skipped).
// -> { setTracks, setPlaylists (entries to put in place of the stored ones with their ids), tracks, playlists (to add), reused,
//      skipped, ids: { tracks, playlists } (a file id -> the id that entry has here afterwards), changed }
function mergePlan(dst, fileMusic, opts) {
    var out = { setTracks: [], setPlaylists: [], tracks: [], playlists: [], reused: 0, skipped: 0, ids: { tracks: Object.create(null), playlists: Object.create(null) }, changed: false };
    var d = musicView(dst), s = cleanMusic(fileMusic), st = storedIds(dst), taken = st.all, rand = opts && opts.rand;
    var size = Object.create(null), bytes = 0, nTracks = d.tracks.length, nPl = d.playlists.length, plHere = Object.create(null);
    d.tracks.forEach(function(t) { size[t.id] = t.size; bytes += t.size; }); d.playlists.forEach(function(p) { plHere[p.id] = 1; });
    var entry = function(id, t) { return { id: id, name: t.name, path: t.path, size: t.size, dur: t.dur }; };
    // first the songs this campaign holds by id: each is updated in place (one stored here but never sent — unclean — counts as new for the caps)
    s.tracks.forEach(function(t) {
        if (!st.tracks[t.id]) return;
        var was = size[t.id];
        if (was === undefined ? (nTracks >= LIMITS.trackDefs || bytes + t.size > LIMITS.campaign) : bytes - was + t.size > LIMITS.campaign) { out.skipped++; return; }
        if (was === undefined) nTracks++; bytes += t.size - (was || 0); size[t.id] = t.size;
        out.setTracks.push(entry(t.id, t)); out.ids.tracks[t.id] = t.id;
    });
    // the files listed here once those updates are in: a new song of the file whose file is listed is that song
    var byPath = Object.create(null), setById = Object.create(null);
    out.setTracks.forEach(function(t) { setById[t.id] = t; });
    d.tracks.forEach(function(t) { var now = setById[t.id] || t; if (!byPath[now.path]) byPath[now.path] = t.id; });
    out.setTracks.forEach(function(t) { if (!byPath[t.path]) byPath[t.path] = t.id; });
    s.tracks.forEach(function(t) {
        if (st.tracks[t.id]) return;
        if (byPath[t.path]) { out.reused++; out.ids.tracks[t.id] = byPath[t.path]; return; }
        if (nTracks >= LIMITS.trackDefs || bytes + t.size > LIMITS.campaign) { out.skipped++; return; }
        var id = st.playlists[t.id] ? newId(taken, 'track', rand) : t.id; if (!id) { out.skipped++; return; }
        taken[id] = 1; byPath[t.path] = id; bytes += t.size; nTracks++;
        out.tracks.push(entry(id, t)); out.ids.tracks[t.id] = id;
    });
    s.playlists.forEach(function(p) {
        var ids = []; p.tracks.forEach(function(tid) { var id = out.ids.tracks[tid]; if (typeof id === 'string') ids.push(id); });
        if (st.playlists[p.id]) {
            if (!plHere[p.id]) { if (nPl >= LIMITS.playlists) { out.skipped++; return; } nPl++; }
            out.setPlaylists.push({ id: p.id, name: p.name, tracks: ids }); out.ids.playlists[p.id] = p.id; return;
        }
        var same = d.playlists.concat(out.playlists).filter(function(q) { return q.name === p.name && q.tracks.length === ids.length && q.tracks.every(function(x, i) { return x === ids[i]; }); })[0];
        if (same) { out.ids.playlists[p.id] = same.id; return; }   // a playlist here of that name over those songs is that playlist (one that took a new id at an earlier merge)
        if (nPl >= LIMITS.playlists) { out.skipped++; return; }
        var clash = st.tracks[p.id] === 1 || out.tracks.some(function(t) { return t.id === p.id; });   // a song here has that id
        var id = clash ? newId(taken, 'playlist', rand) : p.id; if (!id) { out.skipped++; return; }
        taken[id] = 1; nPl++; out.ids.playlists[p.id] = id;
        out.playlists.push({ id: id, name: p.name, tracks: ids });
    });
    out.changed = !!(out.setTracks.length || out.setPlaylists.length || out.tracks.length || out.playlists.length);
    return out;
}
// That plan carried out on the stored music (a music that is no plain object is begun anew): -> the music object to store
function applyMerge(music, plan) {
    var m = music && typeof music === 'object' && !Array.isArray(music) ? music : { v: 1, tracks: [], playlists: [] };
    if (!Array.isArray(m.tracks)) m.tracks = []; if (!Array.isArray(m.playlists)) m.playlists = [];
    var put = function(list, e) { for (var i = 0; i < list.length; i++) if (list[i] && typeof list[i] === 'object' && list[i].id === e.id) list[i] = e; };
    plan.setTracks.forEach(function(t) { put(m.tracks, t); }); plan.setPlaylists.forEach(function(p) { put(m.playlists, p); });
    plan.tracks.forEach(function(t) { m.tracks.push(t); }); plan.playlists.forEach(function(p) { m.playlists.push(p); });
    return m;
}
// The maps that came with that file: a map's remembered music is pointed at wherever its playlist or song now is (ids: a plan's)
function remapMapMusic(items, ids) {
    if (!items || typeof items !== 'object' || !ids || !ids.playlists || !ids.tracks) return;
    Object.keys(items).forEach(function(k) {
        var mm = items[k] && typeof items[k] === 'object' ? items[k].music : null; if (!mm || typeof mm !== 'object') return;
        if (typeof mm.playlist === 'string' && typeof ids.playlists[mm.playlist] === 'string') mm.playlist = ids.playlists[mm.playlist];
        else if (typeof mm.track === 'string' && typeof ids.tracks[mm.track] === 'string') mm.track = ids.tracks[mm.track];
    });
}

var API = { VERSION: VERSION, LIMITS: LIMITS, cleanName: cleanName, cleanLoop: cleanLoop, cleanTrack: cleanTrack, cleanPlaylist: cleanPlaylist, cleanMusic: cleanMusic, cleanMapMusic: cleanMapMusic, cleanControl: cleanControl, folderOf: folderOf, isRefPath: isRefPath, newId: newId, musicView: musicView, bringPlan: bringPlan, mergePlan: mergePlan, applyMerge: applyMerge, remapMapMusic: remapMapMusic };
if (typeof window !== 'undefined') window.wpMusicCore = API;
export { VERSION, LIMITS, cleanName, cleanLoop, cleanTrack, cleanPlaylist, cleanMusic, cleanMapMusic, cleanControl, folderOf, isRefPath, newId, musicView, bringPlan, mergePlan, applyMerge, remapMapMusic };
