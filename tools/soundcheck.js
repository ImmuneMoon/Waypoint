/* Offline check of the sound feature's pure half (system/app/scripts/soundcore.js): the validators a
   client applies to what a host sends, the mix maths and the loop-seam blend. Loads the module once
   with no window (the guard) and once with a stub window (the publication).
   Usage: node tools/soundcheck.js   (exit 1 on any failure) */
'use strict';
const path = require('path');
const url = 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', 'soundcore.js')).replace(/\\/g, '/');
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok       ', name); } else { fail++; console.log('FAIL     ', name, detail !== undefined ? '-> ' + String(detail).slice(0, 300) : ''); } }

let summed = false;   // a check that never settles (a promise nothing answers) would let Node exit with no summary and code 0: that is a failure
process.on('exit', code => { if (!summed && !code) { console.log('\nFAIL      the asynchronous checks never finished (a promise was left waiting)'); process.exitCode = 1; } });
(async () => {
    let S = null, err = null;
    try { S = await import(url); } catch (e) { err = e; }
    check('module loads in Node with no window (the guard)', !!S && !err, err && err.message);
    if (!S) { console.log('\n' + pass + ' passed, ' + fail + ' failed.'); process.exit(1); }
    const { LIMITS, safeId, isUploadPath, cleanEntry, cleanSoundList, cleanSoundCue, mixGain, seamBlend } = S;
    const defaults = { tavern: { name: 'Tavern', file: 'tavern.ogg', kind: 'loop', dur: 60, size: 500000 }, door: { name: 'Door', file: 'door.ogg', kind: 'cue', dur: 1.2, size: 20000 } };
    const up = (o) => Object.assign({ id: 's_1', name: 'Rain', path: '/saves/images/audio/camp_a/ab12cd34_rain.ogg', kind: 'loop', gain: 1, size: 900000, dur: 60 }, o);

    /* ---- paths ---- */
    check('upload path: the one accepted shape', isUploadPath('/saves/images/audio/camp_a/x_rain.ogg') && isUploadPath('/saves/images/audio/camp-1/café night.mp3'));
    check('upload path: wrong folder, traversal, query, control char, extension, depth all refused', !isUploadPath('/saves/images/camp_a/rain.ogg') && !isUploadPath('/saves/images/audio/camp_a/../x.ogg') && !isUploadPath('/saves/images/audio/camp_a/x.ogg?x=1') && !isUploadPath('/saves/images/audio/camp_a/x' + String.fromCharCode(0) + '.ogg') && !isUploadPath('/saves/images/audio/camp_a/x.wav') && !isUploadPath('/saves/images/audio/camp_a/sub/x.ogg') && !isUploadPath('assets/sounds/x.ogg') && !isUploadPath('https://x/y.ogg'));
    check('safeId strips a campaign id to a folder name', safeId('camp_1789/../x') === 'camp_1789x' && safeId('') === '');

    /* ---- entries ---- */
    const e1 = cleanEntry(up({}), { defaults });
    check('entry: an upload keeps id, name, path, kind, gain, size, dur', e1 && e1.id === 's_1' && e1.path === up({}).path && e1.kind === 'loop' && e1.gain === 1 && e1.size === 900000 && e1.dur === 60 && !e1.def, JSON.stringify(e1));
    check('entry: gain and dur clamped, name capped, kind defaults to cue', (() => { const e = cleanEntry(up({ gain: 9, dur: 99999, name: 'x'.repeat(100), kind: 'weird' }), { defaults }); return e.gain === 2 && e.dur === 3600 && e.name.length === LIMITS.name && e.kind === 'cue'; })());
    check('entry: over the file cap or size missing → dropped', cleanEntry(up({ size: LIMITS.file + 1 }), { defaults }) === null && cleanEntry(up({ size: undefined }), { defaults }) === null);
    check('entry: a loop longer than the loop cap becomes a cue', cleanEntry(up({ dur: 500 }), { defaults }).kind === 'cue');
    check('entry: bad id or bad path → dropped', cleanEntry(up({ id: 'a b' }), { defaults }) === null && cleanEntry(up({ path: '/saves/images/audio/camp_a/x.wav' }), { defaults }) === null && cleanEntry(up({ path: 'assets/sounds/tavern.ogg' }), { defaults }) === null);
    const d1 = cleanEntry({ id: 'tavern', def: true, gain: 0.5 }, { defaults });
    check('entry: a default resolves by id to THIS install\'s file, never the host\'s path', d1 && d1.def && d1.path === 'assets/sounds/tavern.ogg' && d1.name === 'Tavern' && d1.kind === 'cue' && d1.gain === 0.5 && d1.size === 0 && d1.dur === 60, JSON.stringify(d1));
    check('entry: a default this install lacks → dropped; def with a path is still by id', cleanEntry({ id: 'nope', def: true }, { defaults }) === null && cleanEntry({ id: 'door', def: true, path: 'assets/sounds/../evil.ogg' }, { defaults }).path === 'assets/sounds/door.ogg');
    check('entry: __proto__ / constructor as a default id resolve to nothing', cleanEntry({ id: '__proto__', def: true }, { defaults }) === null && cleanEntry({ id: 'constructor', def: true }, { defaults }) === null);

    /* ---- lists ---- */
    check('list: non-array → []; duplicates dropped; bad entries skipped', cleanSoundList('x').length === 0 && cleanSoundList([up({}), up({}), up({ id: 'bad id' }), null, up({ id: 's_2' })], { defaults }).map(e => e.id).join() === 's_1,s_2');
    check('list: capped at 200 entries', cleanSoundList(Array.from({ length: 300 }, (_, i) => up({ id: 's_' + i, size: 10 })), { defaults }).length === LIMITS.entries);
    check('list: summed size budget skips what would overflow; defaults cost nothing', (() => { const big = Array.from({ length: 30 }, (_, i) => up({ id: 'b_' + i, size: LIMITS.file })); big.push({ id: 'door', def: true }); const l = cleanSoundList(big, { defaults }); const bytes = l.reduce((s, e) => s + e.size, 0); return bytes <= LIMITS.campaign && l.some(e => e.def) && l.length < 31; })());

    /* ---- cues ---- */
    const list = cleanSoundList([up({}), { id: 'door', def: true }], { defaults });
    check('cue: ambient/cue need an id in the list', cleanSoundCue({ act: 'cue', id: 'door', gain: 3 }, list).gain === 2 && cleanSoundCue({ act: 'ambient', id: 's_1' }, list).id === 's_1' && cleanSoundCue({ act: 'cue', id: 'evil' }, list) === null && cleanSoundCue({ act: 'cue' }, list) === null);
    check('cue: stop takes ambient / all / a listed id, nothing else', cleanSoundCue({ act: 'stop' }, list).id === 'all' && cleanSoundCue({ act: 'stop', id: 'ambient', fade: 99999 }, list).fade === 5000 && cleanSoundCue({ act: 'stop', id: 's_1' }, list).id === 's_1' && cleanSoundCue({ act: 'stop', id: 'evil' }, list) === null);
    check('cue: volume with and without an id; unknown act; a path in the cue is ignored', cleanSoundCue({ act: 'volume', gain: 0.4 }, list).id === undefined && cleanSoundCue({ act: 'volume', id: 'door', gain: 1.5 }, list).gain === 1.5 && cleanSoundCue({ act: 'volume', id: 'x' }, list) === null && cleanSoundCue({ act: 'play', id: 'door' }, list) === null && cleanSoundCue({ act: 'cue', id: 'door', path: '/etc/passwd' }, list).path === undefined);

    /* ---- mix ---- */
    check('mix: entry × master × local, clamped', mixGain({ gain: 1 }, 0.8, 0.5) === 0.4 && mixGain({ gain: 2 }, 2, 1) === 2 && mixGain({ gain: 0.5 }, 0, 1) === 0 && mixGain(null, 1, 1) === 1 && mixGain({ gain: 1 }, 1, 5) === 1);

    /* ---- seam ---- */
    const rate = 1000, len = 5000, ch = new Float32Array(len); for (let i = 0; i < len; i++) ch[i] = i < 300 ? 0 : 1;   // silent head, loud tail
    const sb = seamBlend([ch], rate, 0.3);
    check('seam: loopEnd is seamSec before the end; the head is blended toward the tail with equal power', Math.abs(sb.loopEnd - 4.7) < 1e-9 && sb.channels[0][0] === 1 && Math.abs(sb.channels[0][150] - (0 * Math.sin(Math.PI / 4) + 1 * Math.cos(Math.PI / 4))) < 1e-6 && sb.channels[0][299] < 0.01 && sb.channels[0][400] === 1, sb.channels[0][150] + ' ' + sb.channels[0][299]);
    check('seam: the source is untouched and a short buffer is returned as is', ch[0] === 0 && seamBlend([new Float32Array(500)], rate, 0.3).loopEnd === 0);

    /* ---- publication ---- */
    global.window = {};
    const S2 = await import(url + '?x');
    check('window.wpSoundCore published', !!(global.window.wpSoundCore && global.window.wpSoundCore.cleanSoundList && global.window.wpSoundCore.VERSION === S2.VERSION));
    delete global.window;

    /* ---- Sound's Delete keeps a file another campaign uses (sound.js fileIsOnlyOurs, sliced by its ours markers and run on a state of plain objects) ---- */
    {
        const fs = require('fs');
        const sndT = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'sound.js'), 'utf8').replace(/\r\n/g, '\n');
        const a = sndT.indexOf('// [soundcheck:ours-start]'), b = sndT.indexOf('// [soundcheck:ours-end]');
        check('ours: the slice is marked once', a >= 0 && b > a && sndT.indexOf('// [soundcheck:ours-start]', a + 1) < 0);
        const MC = await import('file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', 'musiccore.js')).replace(/\\/g, '/'));
        const mk = (camps, noCore) => { const st = { appState: { campaigns: camps } }, f = new Function('state', 'window', 'safeId', sndT.slice(a, b) + '\nreturn fileIsOnlyOurs;')(st, noCore ? {} : { wpMusicCore: MC }, safeId); return (camp, p) => f(camps.camp_a, p); };   // the campaign as the state holds it (the same object)
        const P = '/saves/images/audio/camp_a/ab12cd34_rain.ogg', A = { id: 'camp_a', sounds: { v: 1, list: [{ id: 's_1', path: P }] } };
        const other = extra => Object.assign({ id: 'camp_b' }, extra);
        const cases = [
            ['our file, no other campaign', mk({ camp_a: A }), true],
            ['our file, another campaign with no sounds and no music', mk({ camp_a: A, camp_b: other({}) }), true],
            ['another campaign\'s sounds name it', mk({ camp_a: A, camp_b: other({ sounds: { list: [{ id: 's_9', path: P }] } }) }), false],
            ['another campaign\'s music names it (a song brought in by reference)', mk({ camp_a: A, camp_b: other({ music: { v: 1, tracks: [{ id: 't_abc', name: 'Rain', path: P, size: 10 }], playlists: [] } }) }), false],
            ['another campaign\'s music that is a list (read as none)', mk({ camp_a: A, camp_b: other({ music: [{ id: 't_abc', path: P, size: 10 }] }) }), true],
            ['another campaign\'s music naming a track that does not clean (no size)', mk({ camp_a: A, camp_b: other({ music: { tracks: [{ id: 't_abc', path: P }] } }) }), true],
            ['another campaign\'s sounds naming another file', mk({ camp_a: A, camp_b: other({ sounds: { list: [{ id: 's_9', path: '/saves/images/audio/camp_a/other.ogg' }] } }) }), true],
            ['our own campaign naming it twice is still ours', mk({ camp_a: Object.assign({}, A, { music: { tracks: [{ id: 't_x', path: P, size: 1 }] } }) }), true],
            ['a campaign entry that is no object', mk({ camp_a: A, camp_b: null, camp_c: 'x' }), true],
            ['a file in another campaign\'s folder is never ours', mk({ camp_a: A }), false, '/saves/images/audio/camp_b/x.ogg'],
            ['a path that is no text', mk({ camp_a: A }), false, 7],
            ['without the music core only the sounds are read', mk({ camp_a: A, camp_b: other({ music: { tracks: [{ id: 't_abc', path: P, size: 10 }] } }) }, true), true],
            ['without the music core another campaign\'s sounds still count', mk({ camp_a: A, camp_b: other({ sounds: { list: [{ id: 's_9', path: P }] } }) }, true), false],
        ];
        const wrong = cases.filter(c => c[1]({ id: 'camp_a' }, c.length > 3 ? c[3] : P) !== c[2]).map(c => c[0]);
        check('ours: a file is only ours when it lies in this campaign\'s audio folder and no other campaign names it in its sounds or in its music as the app reads it (a list is none, a track that does not clean is none); our own second mention, a campaign that is no object, another file; another folder or a path that is no text never ours; without the music core the sounds alone are read',
            wrong.length === 0, wrong);
        const delSrc = sndT.slice(sndT.indexOf("if (b.classList.contains('snd-del')) {"), sndT.indexOf("document.addEventListener('keydown', function(e) { if (e.key === 'Escape' && m.style.display !== 'none')"));
        check('ours (source): the Delete button asks fileIsOnlyOurs — a file another campaign uses is taken out of this campaign only, said so in the question and the toast, and never sent to /api/delete-image',
            /var ownFile = !entry\.from && String\(entry\.path \|\| ''\)\.indexOf\('\/saves\/images\/audio\/' \+ safeId\(camp\.id\) \+ '\/'\) === 0, shared = ownFile && !fileIsOnlyOurs\(camp, entry\.path\), isRef = !ownFile \|\| shared;/.test(delSrc)
            && /if \(isRef\) \{ toast\(shared \? 'Taken out of this campaign; the file stays for the other campaign that uses it\.' : 'Reference removed\.'\); return; \}\n\s*fetch\('\/api\/delete-image'/.test(delSrc)
            && /\+ \(shared \? ' Its file stays: another campaign uses it\.' : ''\) :/.test(delSrc) && (sndT.match(/fileIsOnlyOurs\(/g) || []).length === 2, delSrc.slice(0, 300));
    }

    summed = true;
    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})();
