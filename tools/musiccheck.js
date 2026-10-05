/* Offline check of the music feature's pure half (system/app/scripts/musiccore.js): the playlist / per-map /
   override validators for what gets stored and what rides the wire. Usage: node tools/musiccheck.js (exit 1 on fail) */
'use strict';
const path = require('path'), fs = require('fs');
const NL = String.fromCharCode(10);
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, NL);
const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).replace(/[\\]/g, '/');
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok       ', name); } else { fail++; console.log('FAIL     ', name, detail !== undefined ? '-> ' + String(detail).slice(0, 300) : ''); } }
const j = o => JSON.stringify(o);

let summed = false;   // a check that never settles (a promise nothing answers) would let Node exit with no summary and code 0: that is a failure
process.on('exit', code => { if (!summed && !code) { console.log('\nFAIL      the asynchronous checks never finished (a promise was left waiting)'); process.exitCode = 1; } });
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

    /* ---- music from another campaign: what bringing it in adds (bringPlan), by reference ---- */
    const { bringPlan, mergePlan, applyMerge, remapMapMusic, musicView, isRefPath, folderOf, newId } = M;
    const seq = () => { let n = 0; return () => ((++n) * 0.0123456789) % 1; };   // the same ids every run
    const fa = n => '/saves/images/audio/campA/' + n + '.mp3', fb = n => '/saves/images/audio/campB/' + n + '.mp3';
    const srcM = () => ({ v: 1, tracks: [{ id: 't_1', name: 'One', path: fa('one'), size: 1000, dur: 10 }, { id: 't_2', name: '  Two  ', path: fa('two'), size: 2000, dur: 20 }, { id: 't_3', name: 'Three', path: fa('three'), size: 3000, dur: 30 }],
        playlists: [{ id: 'pl_1', name: 'Set', tracks: ['t_2', 't_1', 't_2'] }, { id: 'pl_2', name: 'Empty', tracks: [] }] });
    const dstM = () => ({ v: 1, tracks: [{ id: 't_1', name: 'Mine', path: fb('mine'), size: 500, dur: 5 }], playlists: [{ id: 'pl_1', name: 'Own', tracks: ['t_1'] }] });
    const d0 = dstM(), s0 = srcM(), p1 = bringPlan(d0, s0, { playlists: ['pl_1'], tracks: ['t_3', 't_3'] }, { rand: seq() });
    const idsOf = p => p.tracks.map(t => t.id).concat(p.playlists.map(q => q.id));
    check('bringPlan: a picked playlist comes with its songs in its own order (a repeat kept) and a picked song after them — each a new entry under a new id with the same path, name, size and length (the name cleaned); nothing is copied, nothing of either campaign changed',
        j(p1.tracks.map(t => [t.name, t.path, t.size, t.dur])) === j([['Two', fa('two'), 2000, 20], ['One', fa('one'), 1000, 10], ['Three', fa('three'), 3000, 30]]) && p1.playlists.length === 1 && p1.playlists[0].name === 'Set'
        && j(p1.playlists[0].tracks) === j([p1.tracks[0].id, p1.tracks[1].id, p1.tracks[0].id]) && p1.reused === 0 && p1.skipped === 0 && j(d0) === j(dstM()) && j(s0) === j(srcM()), j(p1));
    check('bringPlan: a new id is never one this campaign holds (the source\'s t_1 and pl_1 are also ids here) nor one given in the same bring; it tells where each source id went',
        idsOf(p1).every(id => id !== 't_1' && id !== 'pl_1') && new Set(idsOf(p1)).size === 4 && p1.tracks.every(t => /^t_[a-z0-9]{1,6}$/.test(t.id)) && /^pl_[a-z0-9]{1,6}$/.test(p1.playlists[0].id)
        && j(p1.ids.tracks) === j({ t_2: p1.tracks[0].id, t_1: p1.tracks[1].id, t_3: p1.tracks[2].id }) && j(p1.ids.playlists) === j({ pl_1: p1.playlists[0].id }) && Object.getPrototypeOf(p1.ids.tracks) === null, j(p1.ids));
    const dHas = dstM(); dHas.tracks.push({ id: 't_x', name: 'Two here', path: fa('two'), size: 2000, dur: 20 });
    const p2 = bringPlan(dHas, srcM(), { playlists: ['pl_1'] }, { rand: seq() });
    check('bringPlan: a song whose file this campaign already lists is that song — nothing is added for it and the brought playlist points at the one here',
        j(p2.tracks.map(t => t.name)) === j(['One']) && j(p2.playlists[0].tracks) === j(['t_x', p2.tracks[0].id, 't_x']) && p2.reused === 1 && p2.ids.tracks.t_2 === 't_x');
    const dTwice = dstM(); p1.tracks.forEach(t => dTwice.tracks.push(t)); p1.playlists.forEach(q => dTwice.playlists.push(q));
    const p3 = bringPlan(dTwice, srcM(), { playlists: ['pl_1'], tracks: ['t_3'] }, { rand: seq() });
    check('bringPlan: bringing the same playlist and songs again adds nothing (the playlist is known by its name over the same songs) and still says where they are',
        p3.tracks.length === 0 && p3.playlists.length === 0 && p3.reused === 3 && p3.skipped === 0 && p3.ids.playlists.pl_1 === p1.playlists[0].id && p3.ids.tracks.t_3 === p1.tracks[2].id, j(p3));
    check('bringPlan: an empty playlist comes as it is; a pick that names nothing the source has, or is no list, brings nothing',
        j(bringPlan(dstM(), srcM(), { playlists: ['pl_2'] }, { rand: seq() }).playlists.map(q => [q.name, q.tracks])) === j([['Empty', []]])
        && j(idsOf(bringPlan(dstM(), srcM(), { playlists: ['nope', 5, null, 'bad id!'], tracks: 'x' }))) === '[]' && j(idsOf(bringPlan(dstM(), srcM(), null))) === '[]' && j(idsOf(bringPlan(dstM(), null, { tracks: ['t_1'] }))) === '[]');
    // the caps are cleanMusic's own, counted as it counts them: what is stored is what players are sent
    const many = n => Array.from({ length: n }, (_, i) => ({ id: 'k' + i, name: 'K' + i, path: fb('k' + i), size: 10, dur: 1 }));
    const dFull = { v: 1, tracks: many(LIMITS.trackDefs - 1), playlists: [] }, pCap = bringPlan(dFull, srcM(), { playlists: ['pl_1'], tracks: ['t_3'] }, { rand: seq() });
    const nBig = Math.floor(LIMITS.campaign / LIMITS.file), dBytes = { v: 1, tracks: Array.from({ length: nBig }, (_, i) => ({ id: 'b' + i, name: 'B', path: fb('b' + i), size: LIMITS.file, dur: 1 })), playlists: [] };
    const room = LIMITS.campaign - nBig * LIMITS.file, sBytes = { tracks: [{ id: 'a', name: 'A', path: fa('a'), size: room }, { id: 'b', name: 'B', path: fa('b'), size: 1 }] };
    const pBytes = room > 0 && room <= LIMITS.file ? bringPlan(dBytes, sBytes, { tracks: ['a', 'b'] }, { rand: seq() }) : null;
    const dPls = { v: 1, tracks: [], playlists: Array.from({ length: LIMITS.playlists }, (_, i) => ({ id: 'q' + i, name: 'Q' + i, tracks: [] })) }, pPls = bringPlan(dPls, srcM(), { playlists: ['pl_1', 'pl_2'] }, { rand: seq() });
    const afterCap = { v: 1, tracks: dFull.tracks.concat(pCap.tracks), playlists: dFull.playlists.concat(pCap.playlists) };
    check('bringPlan caps: with room for one more song only one comes (the rest counted as left out) and the playlist keeps the song that came; past the campaign\'s 2 GB of music a song is left out; with the playlists full none comes (its songs still do); what is stored then survives cleanMusic whole',
        pCap.tracks.length === 1 && pCap.tracks[0].name === 'Two' && pCap.skipped === 2 && j(pCap.playlists[0].tracks) === j([pCap.tracks[0].id, pCap.tracks[0].id]) && j(cleanMusic(afterCap)) === j(afterCap)
        && !!pBytes && j(pBytes.tracks.map(t => t.name)) === j(['A']) && pBytes.skipped === 1 && pPls.playlists.length === 0 && pPls.tracks.length === 2 && pPls.skipped === 2, j([pCap.skipped, pBytes && pBytes.skipped, pPls.skipped]));
    check('bringPlan: a song that could not come is not told as being here (so a map that names it is left alone)', !('t_1' in pCap.ids.tracks) && !('t_3' in pCap.ids.tracks) && pCap.ids.tracks.t_2 === pCap.tracks[0].id && Object.keys(pCap.ids.tracks).length === 1, j(pCap.ids));
    const sDup = { tracks: [{ id: 't_a', name: 'A', path: fa('same'), size: 10 }, { id: 't_b', name: 'A again', path: fa('same'), size: 10 }, { id: 't_c', name: 'C', path: fa('c'), size: 10 }], playlists: [{ id: 'pl_d', name: 'Dup', tracks: ['t_a', 't_b', 't_c'] }] };
    const pDup = bringPlan(dstM(), sDup, { playlists: ['pl_d'] }, { rand: seq() }), pOneId = bringPlan(dstM(), sDup, { tracks: ['t_a', 't_c'] }, { rand: () => 0.5 });
    check('bringPlan: two entries of the source that are one file come as one song (the second is the first); an id is given once — where no new id can be found the song is left out, never given another\'s id',
        j(pDup.tracks.map(t => t.name)) === j(['A', 'C']) && j(pDup.playlists[0].tracks) === j([pDup.tracks[0].id, pDup.tracks[0].id, pDup.tracks[1].id]) && pDup.reused === 1
        && pOneId.tracks.length === 1 && pOneId.tracks[0].name === 'A' && pOneId.skipped === 1 && !('t_c' in pOneId.ids.tracks), j([pDup, pOneId]));
    const dNamed = dstM(); dNamed.playlists.push({ id: 'pl_set', name: 'Set', tracks: ['t_1'] });
    check('bringPlan: a playlist here of the same name over other songs is another playlist — the brought one is added beside it',
        bringPlan(dNamed, srcM(), { playlists: ['pl_1'] }, { rand: seq() }).playlists.length === 1 && bringPlan(dNamed, srcM(), { playlists: ['pl_1'] }, { rand: seq() }).playlists[0].name === 'Set');
    check('mergePlan: a file\'s music of any shape is read without a throw — lists that are no lists, or nothing at all, bring nothing; into a campaign with no music a song comes under its own id',
        j(idsOf(mergePlan(dstM(), { tracks: 7, playlists: 'no' }))) === '[]' && j(idsOf(mergePlan(dstM(), null))) === '[]' && j(idsOf(mergePlan(dstM(), 'x'))) === '[]' && j(idsOf(mergePlan(null, { tracks: [{ id: 't_z', name: 'Z', path: fa('z'), size: 1 }] }))) === '["t_z"]');
    const dOneLeft = { v: 1, tracks: [], playlists: Array.from({ length: LIMITS.playlists - 1 }, (_, i) => ({ id: 'q' + i, name: 'Q' + i, tracks: [] })) }, pOneLeft = bringPlan(dOneLeft, srcM(), { playlists: ['pl_1', 'pl_2'] }, { rand: seq() });
    const afterOne = { v: 1, tracks: pOneLeft.tracks, playlists: dOneLeft.playlists.concat(pOneLeft.playlists) };
    check('bringPlan caps: with room for one more playlist, one of two comes — a playlist brought counts at once — and what is stored then survives cleanMusic whole (the GM never holds a playlist players are not sent)',
        pOneLeft.playlists.length === 1 && pOneLeft.playlists[0].name === 'Set' && pOneLeft.skipped === 1 && afterOne.playlists.length === LIMITS.playlists && j(cleanMusic(afterOne)) === j(afterOne), j([pOneLeft.playlists.length, pOneLeft.skipped]));
    const dPrefix = { v: 1, tracks: [{ id: 't_x', name: 'Two here', path: fa('two'), size: 2000, dur: 20 }], playlists: [{ id: 'pl_p', name: 'Set', tracks: ['t_x'] }, { id: 'pl_e', name: 'Set', tracks: [] }] }, pPrefix = bringPlan(dPrefix, srcM(), { playlists: ['pl_1'] }, { rand: seq() });
    check('bringPlan: a playlist here of the same name whose songs are only the first of the brought one\'s (or none) is another playlist — the brought one is added, and it is the one told',
        pPrefix.playlists.length === 1 && j(pPrefix.playlists[0].tracks) === j(['t_x', pPrefix.tracks[0].id, 't_x']) && pPrefix.ids.playlists.pl_1 === pPrefix.playlists[0].id && pPrefix.ids.playlists.pl_1 !== 'pl_p' && pPrefix.ids.playlists.pl_1 !== 'pl_e', j(pPrefix));
    const dNoRoom = { v: 1, tracks: many(LIMITS.trackDefs), playlists: [] };
    check('bringPlan: a playlist none of whose songs could come is left out too (no empty shell of it)', j(idsOf(bringPlan(dNoRoom, srcM(), { playlists: ['pl_1'] }, { rand: seq() }))) === '[]' && bringPlan(dNoRoom, srcM(), { playlists: ['pl_1'] }).skipped === 3);
    // a stored destination that is not clean: reuse and the counts go by what cleanMusic keeps, a new id still avoids every stored id
    const dRaw = { v: 1, tracks: [{ id: 'bad id!', name: 'X', path: fa('two'), size: 2000 }, { id: 't_big', name: 'Y', path: fa('one'), size: LIMITS.file + 1 }, null, 'x'], playlists: [{ id: 'pl_odd', name: 'Empty', tracks: 'x' }, { id: 'pl_ref', name: 'R', tracks: ['t_i'] }, 7] };
    const pRaw = bringPlan(dRaw, srcM(), { playlists: ['pl_2'], tracks: ['t_1', 't_2'] }, { rand: seq() }), pRef = bringPlan(dRaw, srcM(), { tracks: ['t_1'] }, { rand: () => 0.5 });
    check('bringPlan plans on the music as the app reads it: a stored entry players never receive (a bad id, a size past the cap) is not the song — the song is added; a stored playlist the app never shows (its songs no list) is no playlist — one of its name is still brought; a new id is never one the stored music holds or one of its playlists names (a song there is no free id for is left out)',
        pRaw.tracks.length === 2 && pRaw.reused === 0 && pRaw.tracks.every(t => t.id !== 'bad id!' && t.id !== 't_big') && pRaw.playlists.length === 1 && pRaw.playlists[0].name === 'Empty'
        && pRef.tracks.length === 0 && pRef.skipped === 1 && j(musicView(dRaw)) === j({ v: 1, tracks: [], playlists: [{ id: 'pl_ref', name: 'R', tracks: [] }] }) && j(musicView([])) === j({ v: 1, tracks: [], playlists: [] }) && j(musicView('x')) === j(musicView(null)) && j(musicView(Object.assign([], { tracks: [{ id: 't_l', name: 'L', path: fa('l'), size: 1 }], playlists: [] }))) === j(musicView(null))
        && bringPlan({ tracks: [], playlists: [{ id: 'pl_i', name: 'Here', tracks: [] }] }, srcM(), { playlists: ['pl_2'] }, { rand: () => 0.5 }).playlists.length === 0 && bringPlan({ tracks: [], playlists: [] }, srcM(), { playlists: ['pl_2'] }, { rand: () => 0.5 }).playlists[0].id === 'pl_i', j([pRaw, pRef]));
    // a source from a file may hold anything
    const hostile = { tracks: [{ id: 't_w', name: 'web', path: 'https://evil.example/a.mp3', size: 1 }, { id: 't_d', name: 'data', path: '/saves/data.json', size: 1 }, { id: 't_u', name: 'up', path: '/saves/images/audio/../x.mp3', size: 1 }, { id: 't_o', name: 'over', path: fa('o'), size: LIMITS.file + 1 },
        { id: 'bad id', name: 'bad', path: fa('bad'), size: 1 }, { id: '__proto__', name: 'a' + String.fromCharCode(7) + 'b', path: fa('p'), size: 1 }, { id: 'constructor', name: '<img src=x onerror=alert(1)>', path: fa('c'), size: 1 }, null, 7],
        playlists: [{ id: 'toString', name: 'T', tracks: ['__proto__', 'constructor', 't_w', 'nope'] }, { id: 'bad id', name: 'B', tracks: [] }] };
    const pH = bringPlan(dstM(), hostile, { playlists: ['toString', '__proto__', 'bad id'], tracks: ['__proto__', 'constructor', 't_w', 't_d', 't_u', 't_o', 'hasOwnProperty'] }, { rand: seq() });
    check('bringPlan: a hostile source (a web address, a path outside the uploads or with .., a size past the cap, a bad id, control characters, entries and picks named like a prototype\'s keys) brings only its clean songs, writes nothing onto a prototype and throws nothing; a name is kept as text for the page to write as text',
        j(pH.tracks.map(t => [t.name, t.path])) === j([['a b', fa('p')], ['<img src=x onerror=alert(1)>', fa('c')]]) && pH.playlists.length === 1 && j(pH.playlists[0].tracks) === j(pH.tracks.map(t => t.id)) && pH.tracks.every(t => /^t_[a-z0-9]+$/.test(t.id))
        && ({}).polluted === undefined && Object.prototype.toString.call({}) === '[object Object]' && typeof ({}).constructor === 'function', j(pH.tracks));
    check('newId: t_ for a song and pl_ for a playlist, never one already taken, nothing after 50 tries that all collide', (() => {
        const r = seq(), a = newId(Object.create(null), 'track', r), b = newId(Object.create(null), 'playlist', seq());
        const fixed = () => 0.5, first = newId(Object.create(null), 'track', fixed), tk = Object.create(null); tk[first] = 1;
        return /^t_[a-z0-9]{1,6}$/.test(a) && /^pl_[a-z0-9]{1,6}$/.test(b) && newId(tk, 'track', fixed) === '' && typeof newId(Object.create(null)) === 'string' && newId(Object.create(null)).indexOf('t_') === 0;
    })());
    check('isRefPath / folderOf: a song under this campaign\'s own folder is its own, one under another campaign\'s (or a look-alike folder, or no upload path at all) is brought in; a campaign id is read as the folder the upload made of it; a song under another campaign\'s folder is a valid track (it rides the wire and is served)',
        folderOf(fa('one')) === 'campA' && folderOf('/saves/images/m/a.png') === '' && folderOf(null) === '' && isRefPath('campA', fa('one')) === false && isRefPath('campB', fa('one')) === true && isRefPath('camp', fa('one')) === true && isRefPath('campAB', fa('one')) === true
        && isRefPath('camp.A', fa('one')) === false && isRefPath('campA', 'https://x/y.mp3') === true && !!cleanTrack({ id: 't_r', name: 'R', path: fa('one'), size: 10 }) && cleanMusic({ tracks: [{ id: 't_r', name: 'R', path: fa('one'), size: 10 }] }).tracks.length === 1);
    // a campaign file merged into a campaign already here: by id, as the rest of a merge goes
    const fileM = () => ({ tracks: [{ id: 't_1', name: 'One', path: fa('one'), size: 1000, dur: 10 }, { id: 't_9', name: 'Nine', path: fa('nine'), size: 9, dur: 9 }, { id: 't_m', name: 'Mine too', path: fb('mine'), size: 500, dur: 5 }, { id: 't_o', name: 'Other copy', path: fb('other'), size: 7, dur: 7 }, { id: 'pl_1', name: 'Named like a playlist', path: fa('pl'), size: 3, dur: 3 }],
        playlists: [{ id: 'pl_1', name: 'Set', tracks: ['t_1', 't_9', 't_m', 't_o', 'pl_1'] }, { id: 'pl_7', name: 'Seven', tracks: ['t_9'] }, { id: 't_own2', name: 'Named like a song', tracks: [] }] });
    const dM = () => ({ v: 1, tracks: [{ id: 't_1', name: 'Mine', path: fb('mine'), size: 500, dur: 5 }, { id: 't_own2', name: 'Other', path: fb('other'), size: 7, dur: 7 }], playlists: [{ id: 'pl_1', name: 'Own', tracks: ['t_1'] }, { id: 'pl_keep', name: 'Kept', tracks: ['t_own2'] }] });
    const dMerge = dM(), pM = mergePlan(dMerge, fileM(), { rand: seq() }), newT = pM.ids.tracks.pl_1, newP = pM.ids.playlists.t_own2;
    check('a file merged into a campaign (mergePlan), by id: a song this campaign holds by that id is updated (t_1 is now the file\'s); a new one is added under its own id (t_9; t_m, whose file is no longer listed once t_1 is updated); one whose file is listed here under another id is that song (t_o is t_own2); an id this campaign uses for the other kind is changed for a new one; nothing of the stored music is touched by planning',
        j(pM.setTracks) === j([{ id: 't_1', name: 'One', path: fa('one'), size: 1000, dur: 10 }]) && j(pM.tracks.map(t => [t.id === newT ? 'new' : t.id, t.name])) === j([['t_9', 'Nine'], ['t_m', 'Mine too'], ['new', 'Named like a playlist']]) && /^t_[a-z0-9]+$/.test(newT) && newT !== 'pl_1'
        && pM.reused === 1 && j(pM.ids.tracks) === j({ t_1: 't_1', t_9: 't_9', t_m: 't_m', t_o: 't_own2', pl_1: newT }) && pM.skipped === 0 && pM.changed === true && j(dMerge) === j(dM()), j(pM));
    check('mergePlan: a playlist this campaign holds by that id is updated — its name and its songs, each where it now is; a new one is added under its own id, or under a new one where a song here has that id',
        j(pM.setPlaylists) === j([{ id: 'pl_1', name: 'Set', tracks: ['t_1', 't_9', 't_m', 't_own2', newT] }]) && j(pM.playlists.map(q => [q.id === newP ? 'new' : q.id, q.name, q.tracks])) === j([['pl_7', 'Seven', ['t_9']], ['new', 'Named like a song', []]]) && /^pl_[a-z0-9]+$/.test(newP) && newP !== 't_own2'
        && j(pM.ids.playlists) === j({ pl_1: 'pl_1', pl_7: 'pl_7', t_own2: newP }), j([pM.setPlaylists, pM.playlists, pM.ids.playlists]));
    const stored = applyMerge(dMerge, pM), second = mergePlan(stored, fileM(), { rand: seq() }), before2 = j(stored); applyMerge(stored, second);
    check('applyMerge carries the plan out on the stored music — the updated entries in their places, the new ones after, what the file does not name left as it was — and the result is what players are sent; the same file merged again changes nothing (no copy of a playlist, however often)',
        stored === dMerge && j(stored.tracks.map(t => t.id + ':' + t.name)) === j(['t_1:One', 't_own2:Other', 't_9:Nine', 't_m:Mine too', newT + ':Named like a playlist']) && j(stored.playlists.map(q => q.id + ':' + q.name)) === j(['pl_1:Set', 'pl_keep:Kept', 'pl_7:Seven', newP + ':Named like a song'])
        && j(cleanMusic(stored)) === j(stored) && j(stored) === before2 && second.tracks.length === 0 && second.playlists.length === 0 && second.setTracks.length === 3 && second.setPlaylists.length === 2 && second.reused === 2 && second.ids.playlists.t_own2 === newP && second.ids.tracks.pl_1 === newT, j([stored, second]));
    // the reviewer's case: a newer copy of the same campaign, a playlist edited since
    const dOld = { v: 1, tracks: [{ id: 't_a', name: 'A', path: fa('a'), size: 1, dur: 1 }, { id: 't_b', name: 'B', path: fa('b'), size: 1, dur: 1 }], playlists: [{ id: 'pl_b', name: 'Battle', tracks: ['t_a', 't_b'] }] };
    const fNew = { tracks: dOld.tracks.concat([{ id: 't_c', name: 'C', path: fa('c'), size: 1, dur: 1 }]), playlists: [{ id: 'pl_b', name: 'Battle', tracks: ['t_a', 't_b', 't_c'] }] };
    const m1 = applyMerge(dOld, mergePlan(dOld, fNew)), s1 = j(m1.playlists), m2 = applyMerge(m1, mergePlan(m1, fNew)), s2 = j(m2.playlists), m3 = applyMerge(m2, mergePlan(m2, { tracks: fNew.tracks, playlists: [{ id: 'pl_b', name: 'Battle', tracks: ['t_c'] }] }));
    check('a newer copy of the same campaign merged in: its edited playlist is this one, updated — one "Battle", however many times a copy is merged', s1 === j([{ id: 'pl_b', name: 'Battle', tracks: ['t_a', 't_b', 't_c'] }]) && s2 === s1 && j(m3.playlists) === j([{ id: 'pl_b', name: 'Battle', tracks: ['t_c'] }]) && m3.tracks.length === 3, j([s1, s2, m3.playlists]));
    // stored music of an odd shape: a list (never saved as an object), a playlist the app never shows, an entry players never receive
    const fromArr = mergePlan([], fNew), mArr = applyMerge([], fromArr), mNone = applyMerge(undefined, mergePlan(undefined, fNew));
    const dOdd = { tracks: [{ id: 't_a', name: 'bad', path: 'nowhere', size: 1 }, { id: 't_a', name: 'bad twice', path: 'nowhere', size: 1 }], playlists: [{ id: 'pl_b', name: 'Battle', tracks: 'x' }] }, pOdd = mergePlan(dOdd, fNew), mOdd = applyMerge(dOdd, pOdd);
    check('a stored music that is a list (or none) is begun anew by a merge, as an object that is saved; a stored entry of that id that players never receive, and a playlist the app never shows, are put right by the file\'s (every stored entry of the id replaced), not kept beside a copy',
        !Array.isArray(mArr) && j(mArr) === j({ v: 1, tracks: fNew.tracks, playlists: fNew.playlists }) && j(mNone) === j(mArr) && fromArr.changed === true
        && j(pOdd.setTracks.map(t => t.id)) === j(['t_a']) && j(pOdd.tracks.map(t => t.id)) === j(['t_b', 't_c']) && j(pOdd.setPlaylists) === j(fNew.playlists) && pOdd.playlists.length === 0 && j(cleanMusic(mOdd)) === j({ v: 1, tracks: fNew.tracks, playlists: fNew.playlists }) && mOdd.tracks.length === 4 && mOdd.tracks.filter(t => t.id === 't_a').length === 2 && mOdd.tracks.filter(t => t.id === 't_a').every(t => t.path === fa('a')), j([mArr, pOdd, mOdd]));
    const dFullM = { v: 1, tracks: many(LIMITS.trackDefs), playlists: Array.from({ length: LIMITS.playlists }, (_, i) => ({ id: 'q' + i, name: 'Q' + i, tracks: [] })) };
    const pFullM = mergePlan(dFullM, { tracks: [{ id: 'k0', name: 'Renamed', path: fb('k0'), size: 10, dur: 1 }, { id: 't_new', name: 'New', path: fa('new'), size: 1 }], playlists: [{ id: 'q0', name: 'Renamed too', tracks: ['k0', 't_new'] }, { id: 'pl_new', name: 'New', tracks: [] }] });
    check('mergePlan caps: with the library full an entry held by id is still updated, a new song and a new playlist are left out and counted, and an updated playlist keeps only the songs that are here; a file with no music, or music of no shape, changes nothing',
        j(pFullM.setTracks.map(t => t.name)) === j(['Renamed']) && pFullM.tracks.length === 0 && pFullM.playlists.length === 0 && j(pFullM.setPlaylists) === j([{ id: 'q0', name: 'Renamed too', tracks: ['k0'] }]) && pFullM.skipped === 2
        && mergePlan(dM(), null).changed === false && mergePlan(dM(), { tracks: 7, playlists: 'no' }).changed === false && mergePlan(dM(), 'x').changed === false && j(applyMerge(dM(), mergePlan(dM(), null))) === j(dM()), j(pFullM));
    const pHostM = mergePlan(dM(), hostile, { rand: seq() });
    check('mergePlan cleans the file first: of a hostile file\'s music (a web address, a path outside the uploads, a size past the cap, a bad id, control characters, ids named like a prototype\'s keys) only the clean songs and the playlist over them come, nothing is written onto a prototype, nothing thrown',
        j(pHostM.tracks.map(t => [t.id, t.name, t.path])) === j([['__proto__', 'a b', fa('p')], ['constructor', '<img src=x onerror=alert(1)>', fa('c')]]) && j(pHostM.playlists) === j([{ id: 'toString', name: 'T', tracks: ['__proto__', 'constructor'] }]) && pHostM.setTracks.length === 0
        && ({}).polluted === undefined && typeof ({}).constructor === 'function' && Object.prototype.toString.call({}) === '[object Object]', j(pHostM));
    const dTight = { v: 1, tracks: dBytes.tracks.concat([{ id: 't_small', name: 'Small', path: fb('small'), size: 1, dur: 1 }]), playlists: [] };
    const pTight = mergePlan(dTight, { tracks: [{ id: 't_small', name: 'Grown', path: fb('small'), size: LIMITS.file, dur: 1 }, { id: 'b0', name: 'Renamed', path: fb('b0'), size: LIMITS.file, dur: 1 }] });
    check('mergePlan caps: an update that would take the campaign\'s music past 2 GB is left out (the entry here stays as it was); one that fits is made',
        room > 1 && j(pTight.setTracks.map(t => t.name)) === j(['Renamed']) && pTight.skipped === 1 && pTight.tracks.length === 0, j([pTight.setTracks.map(t => t.id), pTight.skipped]));
    const itemsM = { m1: { type: 'map', music: { playlist: 't_own2', loop: 'list' } }, m2: { music: { track: 't_o', loop: 'one' } }, m3: { music: { track: 'pl_1' } }, m4: { music: { playlist: 'pl_gone' } }, m5: { music: 'x' }, m6: null, m7: { music: { playlist: '__proto__' } }, m8: { music: { playlist: 'pl_7' } } };
    remapMapMusic(itemsM, pM.ids);
    check('the maps that came with the file (remapMapMusic): a map\'s remembered playlist or song is pointed at wherever it now is — a new id, the song already here, a kept id; one naming nothing that came, a map with no music and a name like a prototype\'s key are left as they are',
        itemsM.m1.music.playlist === newP && itemsM.m1.music.loop === 'list' && itemsM.m2.music.track === 't_own2' && itemsM.m3.music.track === newT && itemsM.m4.music.playlist === 'pl_gone' && itemsM.m5.music === 'x' && itemsM.m6 === null && itemsM.m7.music.playlist === '__proto__' && itemsM.m8.music.playlist === 'pl_7'
        && (remapMapMusic(null, pM.ids), remapMapMusic(itemsM, null), remapMapMusic(itemsM, {}), true), j(itemsM));
    const mainSrcM = read('system/app/scripts/main.js'), muSrc = read('system/app/scripts/music.js');
    // the import's Merge itself (main.js mergeAppState, sliced and run for real on plain objects with the real musiccore)
    const mergeSrc = mainSrcM.slice(mainSrcM.indexOf('  function mergeAppState(imported) {'), mainSrcM.indexOf("  var _el_importMergeBtn = document.getElementById('importMergeBtn');"));
    const runMerge = (camp, imported, core) => { const state = { appState: { campaigns: { camp }, activeCampaignId: 'camp' } };
        new Function('state', 'window', 'cleanImportedItems', 'takeImportedLibrary', mergeSrc + NL + 'return mergeAppState;')(state, { wpMusicCore: core === undefined ? M : core }, () => {}, () => {})(imported); return state.appState.campaigns.camp; };
    const mfile = music => ({ campaigns: { camp: { id: 'camp', name: 'Camp', items: { m1: { id: 'm1', type: 'map', music: { playlist: 'pl_1', loop: 'list' } }, m2: { id: 'm2', type: 'map', music: { track: 't_x' } } }, music } } });
    const mMusic = () => ({ v: 1, tracks: [{ id: 't_1', name: 'One', path: fa('one'), size: 10, dur: 1 }, { id: 't_x', name: 'Same file', path: fb('mine'), size: 500, dur: 5 }], playlists: [{ id: 'pl_1', name: 'Set', tracks: ['t_1', 't_x'] }] });
    const gA = runMerge({ id: 'camp', name: 'Camp', items: {} }, mfile(mMusic()));
    const gB = runMerge({ id: 'camp', name: 'Camp', items: {}, music: { v: 1, tracks: [{ id: 't_own', name: 'Mine', path: fb('mine'), size: 500, dur: 5 }], playlists: [{ id: 'pl_own', name: 'Own', tracks: ['t_own'] }] } }, mfile(mMusic()));
    const gC = runMerge({ id: 'camp', name: 'Camp', items: {}, music: { tracks: 'x', playlists: 7 } }, mfile(mMusic())), gD = runMerge({ id: 'camp', name: 'Camp', items: {}, music: [] }, mfile(mMusic()));
    const keepM = { v: 1, tracks: [{ id: 't_own', name: 'Mine', path: fb('mine'), size: 500, dur: 5 }], playlists: [] }, gE = runMerge({ id: 'camp', name: 'Camp', items: {}, music: keepM }, mfile(undefined)), gF = runMerge({ id: 'camp', name: 'Camp', items: {}, music: keepM }, mfile(mMusic()), null);
    const gG = runMerge({ id: 'camp', name: 'Camp', items: {}, music: mMusic() }, mfile({ v: 1, tracks: mMusic().tracks, playlists: [{ id: 'pl_1', name: 'Set, edited', tracks: ['t_x'] }] }));
    check('the import\'s Merge, run for real: a file that only changes what the campaign already holds (a playlist edited in a newer copy) is carried out too — one playlist, the file\'s', j(gG.music.playlists) === j([{ id: 'pl_1', name: 'Set, edited', tracks: ['t_x'] }]) && gG.music.tracks.length === 2, j(gG.music));
    check('the import\'s Merge, run for real (main.js mergeAppState): a campaign with no music takes the file\'s songs and playlists, stored on it; one with music keeps its own, takes what is new and points the merged maps at the song it already had; stored music whose lists are no lists, or that is itself a list, ends as an object that is saved; a file with no music, or an app with no music module, leaves the music as it was',
        j(gA.music) === j(mMusic()) && gA.items.m1.music.playlist === 'pl_1' && gA.items.m2.music.track === 't_x'
        && j(gB.music.tracks.map(t => t.id)) === j(['t_own', 't_1']) && j(gB.music.playlists) === j([{ id: 'pl_own', name: 'Own', tracks: ['t_own'] }, { id: 'pl_1', name: 'Set', tracks: ['t_1', 't_own'] }]) && gB.items.m2.music.track === 't_own' && gB.items.m1.music.playlist === 'pl_1'
        && j(gC.music.tracks.map(t => t.id)) === j(['t_1', 't_x']) && gC.music.playlists.length === 1 && !Array.isArray(gD.music) && JSON.parse(j(gD)).music.tracks.length === 2
        && gE.music === keepM && j(gE.music) === j({ v: 1, tracks: [{ id: 't_own', name: 'Mine', path: fb('mine'), size: 500, dur: 5 }], playlists: [] }) && gF.music === keepM && gF.music.tracks.length === 1 && gF.items.m2.music.track === 't_x', j([gA.music, gB.music, gC.music, gD.music]));
    check('the import\'s merge runs them (source): the file\'s music through mergePlan, carried out by applyMerge only when it changes something, the merged maps through remapMapMusic; the panel brings through bringPlan, tags a brought-in song by isRefPath, and reads and writes a campaign\'s music only where it is a plain object',
        /if \(ic\.music && typeof ic\.music === 'object' && window\.wpMusicCore && window\.wpMusicCore\.mergePlan\) \{\n\s*var muP = window\.wpMusicCore\.mergePlan\(existing\.music, ic\.music\);\n\s*if \(muP\.changed\) existing\.music = window\.wpMusicCore\.applyMerge\(existing\.music, muP\);\n\s*window\.wpMusicCore\.remapMapMusic\(ic\.items, muP\.ids\);\n\s*\}/.test(mainSrcM)
        && /var plan = bringPlan\(campMusic\(camp\), campMusic\(src\), \{ playlists: Object\.keys\(picking\.pl\), tracks: Object\.keys\(picking\.tr\) \}\);/.test(muSrc)
        && /if \(campL && isRefPath\(campL\.id, tr\.path\)\) \{ var fr = el\('span', 'music-from', 'from ' \+ campNameOfFolder\(folderOf\(tr\.path\)\)\);/.test(muSrc) && /function closePanel\(\) \{ var p = ui\('musicPanel'\); if \(p\) p\.style\.display = 'none'; picking = null; \}/.test(muSrc)
        && /var m = camp && camp\.music && typeof camp\.music === 'object' && !Array\.isArray\(camp\.music\) \? camp\.music : null,/.test(muSrc) && /if \(!camp\.music \|\| typeof camp\.music !== 'object' \|\| Array\.isArray\(camp\.music\)\) camp\.music = \{ v: 1, tracks: \[\], playlists: \[\] \};/.test(muSrc)
        && /if \(picking && \(!campL \|\| picking\.to !== campL\.id\)\) picking = null;/.test(muSrc) && /    if \(!picking\) \{ headBtns\.appendChild\(fromB\); headBtns\.appendChild\(addF\); \}\n    libHead\.appendChild\(headBtns\); lib\.appendChild\(libHead\); lib\.appendChild\(fileIn\);\n    if \(picking\) renderPicker\(lib\);\n    else if \(!m\.tracks\.length\) /.test(muSrc)
        && /fromB\.addEventListener\('click', function\(\) \{\n        if \(!canWrite\(\)\) \{ toast\('Only the GM manages music\.'\); return; \}\n        var o = otherMusicCamps\(\); if \(!o\.length\) \{ toast\('No other campaign has music\.'\); return; \}\n/.test(muSrc) && /picking = \{ to: campL \? campL\.id : '', from: o\[0\]\.id, pl: Object\.create\(null\), tr: Object\.create\(null\) \}; renderPanel\(\);/.test(muSrc));
    const ixM = read('system/app/index.html'), wnM = read('WHATSNEW.txt'), waM = read('system/app/assets/whatsnew.txt');
    check('said: Help has the GM\'s Music entry with From another campaign… (nothing copied, a song already listed not added twice, × never touches the file, a merged file brings its music); the release notes say it, both copies alike',
        ixM.includes('<li><b>&#127926; Music</b> is the GM&rsquo;s panel for songs, under &#127916; <b>Scene</b>. It holds the campaign&rsquo;s songs and named <b>playlists</b>.') && ixM.includes('<b>From another campaign&hellip;</b> lists your other campaigns that have music. Tick playlists and single songs, then <b>Bring</b> them in. A playlist comes with its songs. Nothing is copied')
        && ixM.includes('takes it out of this campaign&rsquo;s library and playlists and never touches the file') && ixM.includes('A campaign file merged into a campaign already here brings its music with it. A song or a playlist the campaign already holds is updated by the file&rsquo;s, as a merged map is.</li>')
        && wnM.includes('- Music from another campaign: From another campaign… in the Music panel\'s' + NL) && wnM.includes('- A campaign file merged into a campaign already here brings its music too') && wnM.includes('  or a playlist the campaign already holds is updated by the file\'s, as a' + NL + '  merged map is, so merging a newer copy never leaves two of a playlist.')
        && wnM.slice(wnM.indexOf(NL + 'Music' + NL), wnM.indexOf(NL + 'Video' + NL)) === waM.slice(waM.indexOf(NL + 'Music' + NL), waM.indexOf(NL + 'Video' + NL)));

    /* ---- 1.5.2: the song a player's app keeps asking for, a map's changed setting, double-click (music.js sliced by its markers, run for real) ---- */
    {
        const cut = name => { const a = muSrc.indexOf('// [musiccheck:' + name + '-start]'), z = muSrc.indexOf('// [musiccheck:' + name + '-end]'); if (a < 0 || z < a) throw new Error('music.js: the ' + name + ' slice is not marked'); return muSrc.slice(a, z); };
        const settle = async () => { for (let i = 0; i < 6; i++) await new Promise(r => setImmediate(r)); };
        const mkLane = answers => {   // each ask of the file answered in turn: 'busy', 'timeout', 'missing' or a decoded song
            const w = { timers: [], waits: [], toasts: [], started: [], asks: [], client: true, now: 1000 };
            w.api = new Function('bufferFor', 'ac', 'ramp', 'emit', 'broadcastControl', 'showGate', 'isClient', 'toast', 'setTimeout', 'onTrackEnd', 'Date',
                '"use strict"; var loadGen = 0, cur = null, pending = null, rate = 1, controlled = false; function effGain() { return 1; }' + NL + cut('playtrack') + NL + 'return { playTrackAt: playTrackAt, follow: function(v) { controlled = v; }, playing: function() { return cur ? cur.entry.id : null; } };')(
                e => { w.asks.push(e.id); const a = answers.shift(); return a && a.duration ? Promise.resolve(a) : Promise.reject(new Error(a || 'missing')); },
                () => ({ state: 'running', currentTime: 0, destination: {}, createGain: () => ({ gain: { value: 0 }, connect() {} }), createBufferSource: () => ({ playbackRate: { value: 1 }, connect() {}, start(when, off) { w.started.push(Math.round(off * 100) / 100); } }) }),
                () => {}, () => {}, () => {}, () => {}, () => w.client, t => w.toasts.push(t), (fn, ms) => { w.timers.push(fn); w.waits.push(ms); return w.timers.length; }, () => {}, { now: () => w.now });
            w.fire = async () => { const f = w.timers.shift(); if (f) f(); await settle(); };
            return w;
        };
        const A = { id: 't_a', name: 'A' }, B = { id: 't_b', name: 'B' }, song = { duration: 200 };
        const w1 = mkLane(['busy', 'busy', 'busy', 'busy', 'busy', song]); w1.api.playTrackAt(A, 0, 0.4, false); await settle();
        for (let i = 0; i < 5; i++) await w1.fire();
        const w2 = mkLane(['busy', song]); w2.api.playTrackAt(A, 0, 0.4, false); await settle(); w2.api.playTrackAt(B, 0, 0.4, false); await settle(); await w2.fire();
        const w3 = mkLane(new Array(60).fill('busy')); w3.api.playTrackAt(A, 0, 0.4, false); await settle();
        for (let i = 0; i < 60; i++) await w3.fire();
        const w4 = mkLane(['timeout', 'missing']); w4.api.playTrackAt(A, 0, 0.4, false); await settle(); await w4.fire();
        const w5 = mkLane(['busy']); w5.client = false; w5.api.playTrackAt(A, 0, 0.4, false); await settle();
        check('a player\'s app keeps asking for the song the GM is on (playTrackAt run for real): told busy five times it asks five times more, 0.5 s to 2.5 s apart, and plays; a song a later change replaced is never asked for again; a host busy forty times over is given up on and said once, the waits backing off to 4 s; a request that timed out is asked again, a file that is not there is said at once; the GM\'s own machine never asks twice',
            w1.asks.length === 6 && j(w1.waits) === j([500, 1000, 1500, 2000, 2500]) && j(w1.started) === j([0]) && w1.api.playing() === 't_a' && w1.toasts.length === 0
            && j(w2.asks) === j(['t_a', 't_b']) && w2.api.playing() === 't_b' && w2.toasts.length === 0
            && w3.asks.length === 41 && w3.toasts.length === 1 && /could not be loaded from the GM \(A\)/.test(w3.toasts[0]) && w3.waits.length === 40 && Math.max(...w3.waits) === 4000 && w3.timers.length === 0 && w3.api.playing() === null
            && j(w4.asks) === j(['t_a', 't_a']) && w4.toasts.length === 1 && w4.timers.length === 0
            && w5.asks.length === 1 && w5.timers.length === 0 && j(w5.toasts) === j(['Could not play "A": busy']),
            j([w1.asks.length, w1.waits, w1.started, w2.asks, w3.asks.length, w3.toasts, w3.waits.length, w4.asks, w4.toasts, w5.toasts]));
        const w6 = mkLane(['busy', song]); w6.api.follow(true); w6.api.playTrackAt(A, 30, 0.4, false); await settle(); w6.now = 6000; await w6.fire();
        const w7 = mkLane([song]); w7.api.follow(true); w7.api.playTrackAt(A, 190, 0.4, true); w7.now = 21000; await settle();
        const w8 = mkLane(['busy', song]); w8.api.playTrackAt(A, 30, 0.4, false); await settle(); w8.now = 6000; await w8.fire();
        check('following the GM\'s music, the time the file took is added to where the song starts (5 s late: from 35 s, not 30), round its length for a looped song; a map\'s own music starts where it was asked to',
            j(w6.started) === j([35]) && j(w7.started) === j([10]) && j(w8.started) === j([30]), j([w6.started, w7.started, w8.started]));
        const mkTick = () => {
            const w = { calls: [], live: true, solo: false, on: true, camp: null };
            w.tick = new Function('getActiveCampaign', 'net', 'pref', 'featureOn', 'cleanMapMusic', 'idSets', 'W',
                '"use strict"; var cur = null, source = null, controlling = false, controlled = false; function play(s) { W.calls.push(["play", s.kind, s.id, s.loop, !!s.shuffle]); source = s; cur = {}; } function stop() { W.calls.push(["stop"]); source = null; cur = null; } function panelOpen() { return W.panel === true; } function renderPanel() { W.calls.push(["panel"]); }' + NL + cut('tick') + NL + 'tick.watch = watchLive; return tick;')(
                () => w.camp, () => ({ active: w.live }), (k, d) => (k === 'wp_musicSolo' ? (w.solo ? 'on' : 'off') : d), () => w.on, cleanMapMusic, () => ({ trackIds: { t_a: 1, t_b: 1 }, playlistIds: { pl_1: 1 } }), w);
            return w;
        };
        const T = mkTick(), m1 = { type: 'map', music: { track: 't_a', loop: 'one', shuffle: false } }, m2 = { type: 'map' };
        T.camp = { activeItemId: 'm1', items: { m1: m1, m2: m2 } };
        T.tick(); T.tick(); const tFirst = j(T.calls);
        m1.music = { track: 't_b', loop: 'one', shuffle: false }; T.tick(); T.tick(); const tChanged = j(T.calls.slice(1));
        m1.music = { track: 't_b', loop: 'list', shuffle: false }; T.tick(); const tLoop = j(T.calls.slice(2));
        T.camp.activeItemId = 'm2'; T.tick(); const tMoved = T.calls.length;
        T.camp.activeItemId = 'm1'; T.tick(); const tBack = T.calls.length;
        delete m1.music; T.tick(); T.tick(); const tCleared = j(T.calls.slice(3));
        const S = mkTick(); S.live = false; S.camp = { activeItemId: 'm1', items: { m1: { type: 'map', music: { track: 't_a', loop: 'one' } } } }; S.tick(); const tSolo = S.calls.length; S.solo = true; S.tick(); const tSoloOn = j(S.calls);
        check('a map\'s set song (tick run for real): it starts as the map is entered and is not started again by a redraw; changed while the map is on screen it plays at once, once; a changed loop on the same song reaches the player; a map with no song leaves the music alone, and coming back to a song still playing starts nothing; the setting cleared on the map on screen ends what it started; alone and without the solo tick nothing auto-plays',
            tFirst === j([['play', 'track', 't_a', 'one', false]]) && tChanged === j([['play', 'track', 't_b', 'one', false]]) && tLoop === j([['play', 'track', 't_b', 'list', false]]) && tMoved === 3 && tBack === 3 && tCleared === j([['stop']])
            && tSolo === 0 && tSoloOn === j([['play', 'track', 't_a', 'one', false]]),
            j([tFirst, tChanged, tLoop, tMoved, tBack, tCleared, tSolo, tSoloOn]));
        const H = mkTick(); H.live = false; H.camp = { activeItemId: 'm1', items: { m1: { type: 'map', music: { track: 't_a', loop: 'one' } } } };
        H.tick.watch(); H.tick.watch(); const wIdle = H.calls.length;
        H.live = true; H.tick.watch(); H.tick.watch(); const wOpen = j(H.calls);
        H.live = false; H.tick.watch(); H.tick.watch(); const wEnd = j(H.calls.slice(1));
        check('a table that opens plays its map\'s music with no redraw (watchLive run for real): nothing while no session is live, the map\'s song once when one begins and nothing more while it lasts, what it started ended with the session; the boot asks once a second',
            wIdle === 0 && wOpen === j([['play', 'track', 't_a', 'one', false]]) && wEnd === j([['stop']]) && muSrc.includes('    setInterval(watchLive, 1000);'),
            j([wIdle, wOpen, wEnd]));
        const PF = mkTick(); PF.panel = true; PF.live = false; PF.camp = { activeItemId: 'm1', items: { m1: { type: 'map' }, m2: { type: 'map' }, d1: { type: 'planner' } } };
        PF.tick(); PF.tick(); const pfFirst = j(PF.calls);
        PF.camp.activeItemId = 'm2'; PF.tick(); PF.tick(); const pfMoved = PF.calls.length;
        PF.camp.activeItemId = 'd1'; PF.tick(); const pfPage = PF.calls.length;
        PF.camp.items.d2 = { type: 'planner' }; PF.camp.activeItemId = 'd2'; PF.tick(); const pfPage2 = PF.calls.length;   // from one page to another: still no map, nothing to draw again
        PF.panel = false; PF.camp.activeItemId = 'm1'; PF.tick(); const pfShut = PF.calls.length;
        const PW = mkTick(); PW.panel = true; PW.live = false; PW.camp = { activeItemId: 'm1', items: { m1: { type: 'map', music: { track: 't_a', loop: 'one' } } } };
        PW.tick.watch(); const pwIdle = PW.calls.length; PW.live = true; PW.tick.watch(); const pwOpen = j(PW.calls);
        check('an open Music panel follows the map on screen (tick and watchLive run for real): drawn again when another map is opened and when the item on screen is no map, once each, never while the same map stays, never while it is shut; drawn again when a session begins (Take control is offered only at a table); Remember on this map never writes to a map the panel was drawn for earlier',
            pfFirst === j([['panel']]) && pfMoved === 2 && pfPage === 3 && pfPage2 === 3 && pfShut === 3
            && pwIdle === 0 && pwOpen === j([['panel'], ['play', 'track', 't_a', 'one', false], ['panel']])
            && muSrc.includes("            if (activeMapItem() !== it) { renderPanel(); toast('Another map is open now: the panel shows it. Pick its music and press again.'); return; }")
            && muSrc.includes('    panelFollow();   // an open panel shows the map on screen'),
            j([pfFirst, pfMoved, pfPage, pfShut, pwIdle, pwOpen]));
        const mkIdle = o => {   // the panel's play button, on a library and a map of plain objects
            const w = { calls: [], toasts: [] };
            w.api = new Function('activeMapItem', 'cleanMapMusic', 'idSets', 'playlistById', 'trackById', 'musicNow', 'toast', 'W',
                '"use strict"; var source = null, cur = null, selPl = null; function play(s, op) { W.calls.push(["play", s.kind, s.id, s.loop, s.shuffle, !!(op && op.fresh === true)]); } function stopLane() { W.calls.push(["pause"]); } function playCurrent() { W.calls.push(["resume"]); } function emit() {} function broadcastControl() {}' + NL + cut('idle') + NL + 'return { toggle: togglePlay, now: idleNow, set: function(s, c, p) { source = s; cur = c; selPl = p; } };')(
                () => o.map, cleanMapMusic, () => ({ trackIds: o.tracks.reduce((a, t) => (a[t.id] = 1, a), {}), playlistIds: o.lists.reduce((a, p) => (a[p.id] = 1, a), {}) }),
                id => o.lists.find(p => p.id === id) || null, id => o.tracks.find(t => t.id === id) || null, () => ({ tracks: o.tracks, playlists: o.lists }), t => w.toasts.push(t), w);
            return w;
        };
        const libT = [{ id: 't_a', name: 'Song A' }, { id: 't_b', name: 'Song B' }], libP = [{ id: 'pl_1', name: 'Night', tracks: ['t_gone', 't_b'] }, { id: 'pl_0', name: 'Empty', tracks: ['t_gone'] }];
        const I1 = mkIdle({ map: { type: 'map', music: { track: 't_a', loop: 'one', shuffle: false } }, tracks: libT, lists: libP }); const i1Now = I1.api.now(); I1.api.set(null, null, 'pl_1'); I1.api.toggle();
        const I2 = mkIdle({ map: { type: 'map', music: { playlist: 'pl_1', loop: 'list', shuffle: true } }, tracks: libT, lists: libP }); const i2Now = I2.api.now(); I2.api.toggle();
        const I3 = mkIdle({ map: { type: 'map', music: { track: 't_gone', loop: 'one' } }, tracks: libT, lists: libP }); I3.api.set(null, null, 'pl_1'); const i3Now = I3.api.now(); I3.api.toggle();
        const I4 = mkIdle({ map: { type: 'map' }, tracks: libT, lists: libP }); const i4Now = I4.api.now(); I4.api.toggle(); I4.api.set(null, null, 'pl_0'); I4.api.toggle(); I4.api.set(null, null, 'pl_none'); I4.api.toggle();
        const I5 = mkIdle({ map: null, tracks: [], lists: [] }); I5.api.toggle();
        const I6 = mkIdle({ map: { type: 'map', music: { track: 't_a', loop: 'one' } }, tracks: libT, lists: libP }); I6.api.set({ kind: 'track', id: 't_b' }, { entry: libT[1] }, null); I6.api.toggle(); I6.api.set({ kind: 'track', id: 't_b' }, null, null); I6.api.toggle();
        const I7 = mkIdle({ map: { type: 'map', music: { track: 't_a', loop: 'one' } }, tracks: [{ id: 't_a', name: null }], lists: [] }); const i7Now = I7.api.now();
        check('the panel\'s play button with nothing loaded (the idle slice run for real): it plays this map\'s music as the map is set (its song, or its playlist with its loop and shuffle), afresh; a map whose song the library no longer holds, or a map with none, the playlist picked in the panel when it holds a song that is there; with nothing to play it says what to press (a library with no songs: add some) and starts nothing; a song that is paused is resumed and one that plays is paused, as before; the panel\'s line says what the button will play',
            j(I1.calls) === j([['play', 'track', 't_a', 'one', false, true]]) && i1Now === 'Stopped — ▶ plays this map’s music (Song A)'
            && j(I2.calls) === j([['play', 'playlist', 'pl_1', 'list', true, true]]) && i2Now === 'Stopped — ▶ plays this map’s music (Night)'
            && j(I3.calls) === j([['play', 'playlist', 'pl_1', 'list', false, true]]) && i3Now === 'Stopped — ▶ plays the playlist Night'
            && i4Now === 'Stopped' && I4.calls.length === 0 && I4.toasts.length === 3 && I4.toasts.every(t => t === 'Nothing is picked to play: double-click a song, or press a playlist’s ▶.')
            && I5.calls.length === 0 && j(I5.toasts) === j(['No music yet: add songs in the library below.'])
            && j(I6.calls) === j([['pause'], ['resume']]) && I6.toasts.length === 0
            && i7Now === 'Stopped — ▶ plays this map’s music ()',
            j([I1.calls, i1Now, I2.calls, i2Now, I3.calls, i3Now, i4Now, I4.calls, I4.toasts, I5.toasts, I6.calls, i7Now]));
        check('the panel says it: the transport\'s line asks the idle words in both places it is written (never while a song is loaded), this map\'s part is headed by the map\'s own title as text and says when its music starts, the solo tick draws the panel again; Help and both release notes say it',
            muSrc.includes("    var now = st.entry ? st.entry.name : (m.tracks.length ? (source ? 'Stopped' : idleNow()) : 'No tracks yet');")
            && muSrc.includes("if (now) now.textContent = st.entry ? st.entry.name : (campMusic().tracks.length ? (source ? 'Stopped' : idleNow()) : 'No tracks yet');")
            && muSrc.includes("bindWrap.appendChild(el('div', 'music-sec-head', 'On this map (' + ((it.meta && typeof it.meta.title === 'string' && it.meta.title) || it.name || 'map') + ')'));")
            && muSrc.includes("if (cfg) bindWrap.appendChild(el('div', 'music-empty music-bindnote', 'It starts by itself while a session is live' + (soloAutoOn() ? ', and while you are alone (ticked above).' : '. Alone, press ▶ above, or tick “Auto-play map music while solo”.')));")
            && muSrc.includes("lastKey = ''; lastMapId = ''; tick(); renderPanel(); });")
            && ixM.includes('A map&rsquo;s music starts by itself while a session is live. Alone, it starts only with <b>Auto-play map music while solo</b> ticked. With nothing playing, the panel&rsquo;s &#9654; plays this map&rsquo;s music, or the playlist you picked, and the panel says which.')
            && wnM.includes('- The panel\'s play button with nothing loaded plays this map\'s music, or') && wnM.includes('- A map\'s own music starts for the GM when the table opens.') && wnM.includes('- The Music panel, left open while you went to another map, kept showing')
            && waM.includes('- The panel\'s play button with nothing loaded plays this map\'s music, or') && waM.includes('- A map\'s own music starts for the GM when the table opens.'));
        const netM = read('system/app/scripts/net.js');
        check('double-click: a song in the library and a song inside a playlist are wired to play from the beginning (and each library song has its play button), never from a press on one of the row\'s buttons; a song already playing is started again only when asked afresh; a file still arriving is not timed out (the wait is for the next part); Help and both release notes say it, the 1.5.2 notes alike in both files',
            muSrc.includes("row.addEventListener('dblclick', function(e) { if (e.target && e.target.closest && e.target.closest('button')) return; playTrack(tr.id); });")
            && muSrc.includes("pb.addEventListener('click', function() { playTrack(tr.id); }); row.appendChild(pb);")
            && muSrc.includes("trow.addEventListener('dblclick', function(e) { if (e.target && e.target.closest && e.target.closest('button')) return; playListFrom(pl.id, tid); });")
            && muSrc.includes("function playTrack(id) { if (trackById(id)) play({ kind: 'track', id: id, loop: 'list', shuffle: false }, { fresh: true, fade: 0.25 }); }")
            && muSrc.includes("shuffle: false }, { fresh: true, index: i > 0 ? i : 0, fade: 0.25 });")
            && muSrc.includes("if (!opts.pos && !opts.fresh && source && cur && source.kind === src.kind && source.id === src.id) {")
            && netM.includes("clearTimeout(w.timer); w.timer = setTimeout(function() { if (own(assetWaiters, msg.path) && assetWaiters[msg.path] === w) delete assetWaiters[msg.path]; w.reject(new Error('timeout')); }, ASSET_WAIT);")
            && ixM.includes('Changed while players are on the map, it changes for them at once.') && ixM.includes('Double-click a song in the library, or press its &#9654;, to play it at once. Double-click a song inside a playlist to play the playlist from there.')
            && wnM.includes('- Double-click a song in the library to play it at once') && wnM.includes('- A player could lose the table\'s music when the GM changed songs quickly:') && wnM.includes('- The song a map is set to play (Remember on this map) changes at once,')
            && wnM.indexOf('WAYPOINT 1.5.1') > 0 && wnM.slice(0, wnM.indexOf('WAYPOINT 1.5.1')) === waM.slice(0, waM.indexOf('WAYPOINT 1.5.1')));
    }

    /* ---- publication ---- */
    global.window = {};
    const M2 = await import(url('musiccore.js') + '?x');
    check('window.wpMusicCore published', !!(global.window.wpMusicCore && global.window.wpMusicCore.cleanMusic && global.window.wpMusicCore.VERSION === M2.VERSION)
        && ['folderOf', 'isRefPath', 'newId', 'musicView', 'bringPlan', 'mergePlan', 'applyMerge', 'remapMapMusic'].every(k => typeof global.window.wpMusicCore[k] === 'function'));
    delete global.window;

    /* ---- 1.5.4: Music a player switched off for themselves keeps its icon, struck through, with the way back ---- */
    {
        const jj = JSON.stringify, rd4 = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, NL), mu4 = rd4('system/app/scripts/music.js'), so4 = rd4('system/app/scripts/sound.js'), ix4 = rd4('system/app/index.html'), css4 = rd4('system/app/style.css');
        const sl4 = mu4.slice(mu4.indexOf('// [musiccheck:offmine-start]'), mu4.indexOf('// [musiccheck:offmine-end]'));
        const run4 = (on, why, playing, muted, noVtt) => {
            const ind = { style: { display: 'x' }, title: '', cls: {}, classList: { toggle(k, v) { ind.cls[k] = !!v; } } }, sets = [];
            const elF = (tag, cls, text) => ({ tag, cls: cls || '', text: text || '', title: '', kids: [], on: {}, appendChild(x) { this.kids.push(x); return x; }, addEventListener(t, fn) { this.on[t] = fn; } });
            const api = new Function('ui', 'window', 'featureOn', 'nowPlaying', 'el', 'closePill', 'cur', 'mmuted', "'use strict';" + NL + sl4 + NL + 'return { offMine, renderPill, offPill };')(
                id => (id === 'musicInd' ? ind : null), noVtt ? {} : { wpVtt: { whyOff: id => (id === 'music' ? why : ''), setLocal: (id, off) => { sets.push([id, off]); return true; } } }, () => on, () => (playing ? { name: 'Song' } : null), elF, () => sets.push('closed'), playing ? {} : null, !!muted);
            api.renderPill(); const pop = elF('div'); api.offPill(pop); pop.kids[pop.kids.length - 1].on.click({});
            return [ind.style.display, ind.cls['off-mine'], ind.cls.playing, ind.cls.muted, ind.title, api.offMine(), pop.kids.map(k => k.tag + ':' + k.text), sets];
        };
        const R4 = { on: run4(true, '', true, true), mine: run4(false, 'local', true, true), gm: run4(false, 'gm', false, false), own: run4(false, 'own', false, false), none: run4(false, 'local', false, false, true) };
        check('1.5.4 Music a player switched off for themselves keeps its icon (music.js sliced by its offmine markers, run for real): the icon stays and is marked off-mine, neither playing nor muted, its title says how to bring it back; its menu is fixed words and one button that switches Music back on for them and closes; with Music on the icon is as ever; off by the GM\'s word, or by the campaign\'s own setting away from a table, it is hidden as before',
            jj(R4.on.slice(0, 6)) === jj(['', false, true, true, 'Music — your volume and mute · now playing: Song', false])
            && jj(R4.mine) === jj(['', true, false, false, 'Music is off for you at this table \u2014 click to turn it back on', true, ['div:Music', 'div:Off for you at this table', 'button:Turn music back on for me'], [['music', false], 'closed']])
            && R4.gm[0] === 'none' && R4.gm[1] === false && R4.own[0] === 'none' && R4.own[1] === false && R4.none[0] === 'none' && R4.none[5] === false, jj(R4));
        check('1.5.4 the icon\'s click opens that menu while Music is off for them, Sound marks its own icon the same way and offers Turn sound back on for me, both icons are struck through by the stylesheet, the music module is told of every feature change as the sound module is (its icon was left as it was until a song started or stopped), and Help says so',
            mu4.includes("    if (offMine()) { var popO = el('div', 'music-pillpop'); pillPop = popO; offPill(popO); showPill(popO); return; }")
            && so4.includes("var mine = !st.on && !!(window.wpVtt && typeof window.wpVtt.whyOff === 'function' && window.wpVtt.whyOff('sound') === 'local');") && so4.includes("b.classList.toggle('off-mine', mine);")
            && so4.includes("var onB = ui('soundOnBtn'); if (onB) onB.style.display = mine ? '' : 'none';") && so4.includes("if (e.target.id === 'soundOnBtn') { if (window.wpVtt) window.wpVtt.setLocal('sound', false); pop.style.display = 'none'; refresh(); }")
            && ix4.includes('<button type="button" class="tool ghost" id="soundOnBtn" style="display:none; width:100%; margin:4px 0 2px;">Turn sound back on for me</button>')
            && css4.includes('#musicInd.off-mine::after, #soundInd.off-mine::after {') && css4.includes('#musicInd.off-mine, #soundInd.off-mine { opacity: .7; }')
            && rd4('system/app/scripts/vtt.js').split('    if (window.wpSoundSync) window.wpSoundSync();' + NL + '    if (window.wpMusicSync) window.wpMusicSync();' + NL).length === 6 && mu4.includes('window.wpMusicSync = sync;')
            && ix4.includes('A feature you switched off for yourself keeps its icon: <b>Music</b> and <b>Sound</b> stay in the top bar, struck through, and a click offers <b>Turn back on for me</b>.'));
    }
    summed = true;
    console.log(NL + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})();
