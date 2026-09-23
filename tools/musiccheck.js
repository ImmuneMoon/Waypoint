/* Offline check of the music feature's pure half (system/app/scripts/musiccore.js): the playlist / per-map /
   override validators for what gets stored and what rides the wire. Usage: node tools/musiccheck.js (exit 1 on fail) */
'use strict';
const path = require('path');
const NL = String.fromCharCode(10);
const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).replace(/[\\]/g, '/');
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok       ', name); } else { fail++; console.log('FAIL     ', name, detail !== undefined ? '-> ' + String(detail).slice(0, 300) : ''); } }
const j = o => JSON.stringify(o);

(async () => {
    let M = null, err = null;
    try { M = await import(url('musiccore.js')); } catch (e) { err = e; }
    check('musiccore loads in Node with no window', !!M && !err, err && err.message);
    if (!M) { console.log(NL + pass + ' passed, ' + fail + ' failed.'); process.exit(1); }
    const { LIMITS, cleanTrack, cleanPlaylist, cleanMusic, cleanMapMusic, cleanControl } = M;
    const P = '/saves/images/audio/camp1/song.mp3';

    /* ---- playlists ---- */
    check('cleanPlaylist: keeps id, trims the name, keeps track ids (repeats allowed), drops bad ids', (() => {
        const p = cleanPlaylist({ id: 'pl_1', name: '  Cantina  ', tracks: ['t_a', 't_a', 't_b', 5, 'bad id!', ''] });
        return p && p.id === 'pl_1' && p.name === 'Cantina' && j(p.tracks) === '["t_a","t_a","t_b"]';
    })());
    check('cleanPlaylist: a bad id is refused; a blank name defaults; control chars stripped', cleanPlaylist({ id: 'bad id', tracks: [] }) === null && cleanPlaylist({ id: 'pl_2' }).name === 'Playlist' && cleanPlaylist({ id: 'pl_3', name: 'ab' }).name === 'a b');
    check('cleanPlaylist: opts.trackIds filters to tracks that exist', j(cleanPlaylist({ id: 'pl_4', tracks: ['t_a', 't_x', 't_b'] }, { trackIds: { t_a: 1, t_b: 1 } }).tracks) === '["t_a","t_b"]');
    check('cleanPlaylist: caps the track count', cleanPlaylist({ id: 'pl_5', tracks: new Array(LIMITS.tracks + 50).fill('t_a') }).tracks.length === LIMITS.tracks);

    /* ---- tracks ---- */
    check('cleanTrack: an uploaded song under the audio path, sized under the cap', (() => { const t = cleanTrack({ id: 't_a', name: 'Cantina Band', path: P, size: 5e6, dur: 180 }); return t && t.id === 't_a' && t.name === 'Cantina Band' && t.path === P && t.size === 5000000 && t.dur === 180; })());
    check('cleanTrack: a bad id, a non-audio path, or an over-cap size is refused', cleanTrack({ id: 'bad id', path: P }) === null && cleanTrack({ id: 't_a', path: '/etc/passwd' }) === null && cleanTrack({ id: 't_a', path: P, size: LIMITS.file + 1 }) === null && cleanTrack({ id: 't_a', path: P, size: 'x' }) === null);

    /* ---- camp.music ---- */
    check('cleanMusic: v1 shell with tracks + playlists; dedupes ids; filters playlist refs to tracks that exist', (() => {
        const m = cleanMusic({ v: 9, tracks: [{ id: 't_a', path: P, size: 1e6 }, { id: 't_a', path: P, size: 1e6 }, { id: 't_b', path: P, size: 1e6 }], playlists: [{ id: 'pl_1', name: 'A', tracks: ['t_a', 't_x', 't_b'] }, { id: 'pl_1', name: 'dup' }, null, { id: 'pl_2', name: 'B' }] });
        return m.v === 1 && m.tracks.length === 2 && j(m.playlists[0].tracks) === '["t_a","t_b"]' && m.playlists.length === 2 && m.playlists[0].name === 'A' && m.playlists[1].id === 'pl_2';
    })());
    check('cleanMusic: not an object → empty shell (tracks + playlists)', j(cleanMusic(null)) === j({ v: 1, tracks: [], playlists: [] }) && j(cleanMusic({ tracks: 'no', playlists: 'no' })) === j({ v: 1, tracks: [], playlists: [] }));
    check('cleanMusic: caps tracks and playlists at their limits', cleanMusic({ tracks: Array.from({ length: LIMITS.trackDefs + 10 }, (_, i) => ({ id: 't' + i, path: P, size: 1000 })), playlists: Array.from({ length: LIMITS.playlists + 10 }, (_, i) => ({ id: 'pl_' + i })) }).tracks.length === LIMITS.trackDefs);

    /* ---- per-map config ---- */
    check('cleanMapMusic: a playlist config with loop + shuffle', (() => { const m = cleanMapMusic({ playlist: 'pl_1', loop: 'one', shuffle: true }); return m && m.playlist === 'pl_1' && m.loop === 'one' && m.shuffle === true && m.track === undefined; })());
    check('cleanMapMusic: a single-track config; a bad loop defaults to list; shuffle defaults false', (() => { const m = cleanMapMusic({ track: 't_a', loop: 'nope' }); return m && m.track === 't_a' && m.loop === 'list' && m.shuffle === false && m.playlist === undefined; })());
    check('cleanMapMusic: neither playlist nor track (or a dangling ref under opts) → null', cleanMapMusic({}) === null && cleanMapMusic({ loop: 'one' }) === null && cleanMapMusic({ playlist: 'pl_x' }, { playlistIds: { pl_1: 1 } }) === null);
    check('cleanMapMusic: a valid ref under opts is kept; playlist wins over a track if both are given', (() => { const m = cleanMapMusic({ playlist: 'pl_1', track: 't_a' }, { playlistIds: { pl_1: 1 }, trackIds: { t_a: 1 } }); return m && m.playlist === 'pl_1' && m.track === undefined; })());

    /* ---- the GM's live override ---- */
    check('cleanControl: on:false releases (nothing else kept)', j(cleanControl({ on: false, playlist: 'pl_1' })) === j({ on: false }) && j(cleanControl({})) === j({ on: false }));
    check('cleanControl: a full override — playlist, loop, shuffle, playing, index/pos/ts clamped, optional forced vol', (() => {
        const c = cleanControl({ on: true, playlist: 'pl_1', loop: 'one', shuffle: true, playing: true, index: 3, pos: 42.5, ts: 1000, vol: 0.5 });
        return c.on === true && c.playlist === 'pl_1' && c.loop === 'one' && c.shuffle === true && c.playing === true && c.index === 3 && c.pos === 42.5 && c.ts === 1000 && c.vol === 0.5;
    })());
    check('cleanControl: the exact "now" track id is kept (shuffle-safe follow) and filtered against opts.trackIds', (() => {
        const c = cleanControl({ on: true, playlist: 'pl_1', now: 't_a', pos: 5 }, { playlistIds: { pl_1: 1 }, trackIds: { t_a: 1 } });
        const d = cleanControl({ on: true, playlist: 'pl_1', now: 't_x' }, { playlistIds: { pl_1: 1 }, trackIds: { t_a: 1 } });   // now not in trackIds -> dropped, not the whole control
        return c.now === 't_a' && d.now === undefined && d.playlist === 'pl_1';
    })());
    check('cleanControl: playing defaults true, vol omitted when absent, negative pos/index clamped to 0, over-cap pos clamped', (() => {
        const c = cleanControl({ on: true, track: 't_a', pos: -5, index: -2 });
        const d = cleanControl({ on: true, track: 't_a', pos: 1e9 });
        return c.playing === true && !('vol' in c) && c.pos === 0 && c.index === 0 && d.pos === LIMITS.pos;
    })());
    check('cleanControl: an on override with neither playlist nor track is refused', cleanControl({ on: true, loop: 'list' }) === null);
    check('cleanControl: refs validated against opts when given', cleanControl({ on: true, playlist: 'pl_x' }, { playlistIds: { pl_1: 1 } }) === null && cleanControl({ on: true, track: 't_a' }, { trackIds: { t_a: 1 } }).track === 't_a');

    /* ---- publication ---- */
    global.window = {};
    const M2 = await import(url('musiccore.js') + '?x');
    check('window.wpMusicCore published', !!(global.window.wpMusicCore && global.window.wpMusicCore.cleanMusic && global.window.wpMusicCore.VERSION === M2.VERSION));
    delete global.window;

    console.log(NL + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})();
