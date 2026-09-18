/* Offline check of the sound feature's pure half (system/app/scripts/soundcore.js): the validators a
   client applies to what a host sends, the mix maths and the loop-seam blend. Loads the module once
   with no window (the guard) and once with a stub window (the publication).
   Usage: node tools/soundcheck.js   (exit 1 on any failure) */
'use strict';
const path = require('path');
const url = 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', 'soundcore.js')).replace(/\\/g, '/');
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok       ', name); } else { fail++; console.log('FAIL     ', name, detail !== undefined ? '-> ' + String(detail).slice(0, 300) : ''); } }

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

    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})();
