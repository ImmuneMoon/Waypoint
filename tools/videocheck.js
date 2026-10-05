/* Offline check of campaign videos (backlog item 21): the pure half (system/app/scripts/videocore.js) — the library's cleaner, the
   only paths an uploaded video may have, a video element's address, the name a file is uploaded under (and that the local server
   takes it), the words the Video panel shows; the panel's own rules sliced from video.js and run for real (a file deleted only
   when no other campaign lists it, the corner's size clamped); and the panel wired into the page, the feature list, Help, the
   tour and the integration guide. No DOM. Usage: node tools/videocheck.js   (exit 1 on any failure) */
'use strict';
const path = require('path'), fs = require('fs');
const NL = String.fromCharCode(10);
const app = path.join(__dirname, '..', 'system', 'app');
const url = f => 'file:///' + path.resolve(path.join(app, 'scripts', f)).replace(/[\\]/g, '/');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, NL);
const j = o => JSON.stringify(o);
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok       ', name); } else { fail++; console.log('FAIL     ', name, detail !== undefined ? '-> ' + String(detail).slice(0, 400) : ''); } }
function sliceOf(src, name) {
    const a = '// [videocheck:' + name + '-start]', b = '// [videocheck:' + name + '-end]', i = src.indexOf(a), k = src.indexOf(b);
    if (i < 0 || k < i || src.indexOf(a, i + 1) >= 0) throw new Error('videocheck: marker ' + name);
    return src.slice(i + a.length, k);
}

let summed = false;   // a check that never settles (a promise nothing answers) would let Node exit with no summary and code 0: that is a failure
process.on('exit', code => { if (!summed && !code) { console.log(NL + 'FAIL      the asynchronous checks never finished (a promise was left waiting)'); process.exitCode = 1; } });
(async () => {
    let V = null, err = null;
    try { V = await import(url('videocore.js')); } catch (e) { err = e; }
    check('videocore loads in Node with no window', !!V && !err, err && err.message);
    if (!V) { console.log(NL + pass + ' passed, ' + fail + ' failed.'); process.exit(1); }
    const T = '<img src=x onerror=alert(1)>';

    /* ---- the paths an uploaded video may have ---- */
    const good = ['/saves/images/video/camp_1/k3j9a0pq_intro.mp4', '/saves/images/video/c-2/a.WEBM', '/saves/images/video/c/x_(final).m4v', '/saves/images/video/c/x.ogv', '/saves/images/video/c/x.mov', '/saves/images/video/c/Überfahrt_é.mp4'];
    const bad = ['', null, 5, {}, 'https://evil.example/x.mp4', '//evil.example/x.mp4', 'javascript:x.mp4', '/saves/images/video/c/x.html', '/saves/images/video/c/x.mp4.exe', '/saves/images/video/c/x.mkv',
        '/saves/images/video/c/../x.mp4', '/saves/images/video/c/..x.mp4', '/saves/images/video/c/.x.mp4', '/saves/images/video/../x.mp4', '/saves/images/video/c/d/x.mp4', '/saves/images/video/c/a b.mp4', '/saves/images/video/c/a%20b.mp4',
        '/saves/images/video/c/a?.mp4', '/saves/images/video/c/a#.mp4', '/saves/images/video/c/a\\b.mp4', '/saves/images/video/c/a' + String.fromCharCode(0) + '.mp4', '/saves/images/video/c/a' + String.fromCharCode(10) + '.mp4',
        '/saves/images/audio/c/x.mp4', '/saves/images/map1/x.mp4', '/saves/images/video/c' + 'x'.repeat(60) + '/a.mp4', '/saves/images/video/c/' + 'x'.repeat(197) + '.mp4', '/saves/images/video/c:1/a.mp4', ' /saves/images/video/c/a.mp4'];
    check('an uploaded video\'s path: /saves/images/video/<a campaign\'s safe id>/<one file name> ending .mp4, .m4v, .webm, .ogv or .mov (any case), a name in any script — never a web address, a scheme, a page, another extension, a walk, a hidden file, a sub-folder, a space, a percent sign, a query, a fragment, a backslash, a control character, another folder under images or a name past 200 characters',
        good.every(V.isVideoPath) && !bad.some(V.isVideoPath) && V.isVideoPath('/saves/images/video/c/' + 'x'.repeat(196) + '.mp4'), j([good.filter(x => !V.isVideoPath(x)), bad.filter(V.isVideoPath)]));
    check('a video element\'s address is the path with its file name percent-encoded (the local server decodes it), or nothing for anything else',
        V.videoSrc(good[0]) === good[0] && V.videoSrc(good[5]) === '/saves/images/video/c/' + encodeURIComponent('Überfahrt_é.mp4') && bad.every(p => V.videoSrc(p) === ''));

    /* ---- the library's cleaner ---- */
    const e0 = { id: 'v_abcdefgh', name: 'Intro', path: good[0], size: 1234 };
    check('an entry keeps its id (v_ and 8 of a-z and 0-9), name, path and size; a length and a picture size only as numbers in range (the length to a tenth, the size whole); nothing else rides along',
        j(V.cleanVideo(Object.assign({}, e0, { dur: 94.56, w: 1920.4, h: 1080, extra: T, __proto__: { polluted: 1 } }))) === j({ id: 'v_abcdefgh', name: 'Intro', path: good[0], size: 1234, dur: 94.6, w: 1920, h: 1080 })
        && j(V.cleanVideo(Object.assign({}, e0, { dur: 0, w: 1920 }))) === j(e0) && j(V.cleanVideo(Object.assign({}, e0, { dur: '12', w: '1920', h: '1080' }))) === j(e0) && j(V.cleanVideo(Object.assign({}, e0, { dur: 1e9, w: 99999, h: 5 }))) === j(e0));
    const refused = [null, 'x', [], Object.assign({}, e0, { id: 'v_ABCDEFGH' }), Object.assign({}, e0, { id: 'v_abcdefg' }), Object.assign({}, e0, { id: '__proto__' }), Object.assign({}, e0, { path: bad[4] }),
        Object.assign({}, e0, { size: -1 }), Object.assign({}, e0, { size: '1234' }), Object.assign({}, e0, { size: true }), Object.assign({}, e0, { size: NaN }), Object.assign({}, e0, { size: 2e12 }), Object.assign({}, e0, { size: undefined })];
    check('an entry with no object, a wrong id, a path that is not an uploaded video\'s, or a size that is no number in bytes (a string, a boolean, negative, past 10^12) is dropped', refused.every(x => V.cleanVideo(x) === null), j(refused.map(V.cleanVideo)));
    check('a name: control characters and runs of space as one space, trimmed, cut to 60 characters by code points (never half an emoji), a name of nothing gets the default; markup kept as text (the panel escapes it)',
        V.cleanName(' A\u0000\u0007b \t c ', 'x') === 'A b c' && V.cleanName('😀'.repeat(70), 'x') === '😀'.repeat(60) && V.cleanName('   ', 'Video') === 'Video' && V.cleanName(7, 'Video') === 'Video' && V.cleanName(T, 'x') === T && V.cleanVideo(Object.assign({}, e0, { name: '' })).name === 'Video');
    const many = []; for (let i = 0; i < 130; i++) many.push({ id: 'v_' + String(i).padStart(8, '0'), name: 'n' + i, path: '/saves/images/video/c/f' + i + '.mp4', size: i });
    const lib = V.cleanVideos([e0, Object.assign({}, e0, { name: 'same id' }), Object.assign({}, e0, { id: 'v_bbbbbbbb', name: 'same file' }), { id: 'v_cccccccc', path: '/saves/images/video/c/y.webm', size: 0 }, T, null]);
    check('the library: entries that clean, in their order, an id once and a file once, at most 100; no list is an empty library',
        j(lib.map(x => x.id)) === j(['v_abcdefgh', 'v_cccccccc']) && lib[0].name === 'Intro' && V.cleanVideos(many).length === 100 && V.cleanVideos(many)[99].id === 'v_00000099' && j(V.cleanVideos('x')) === '[]' && j(V.cleanVideos({ length: 3 })) === '[]' && V.LIMITS.videos === 100);

    const mA = { id: 'v_aaaaaaaa', name: 'Here', path: '/saves/images/video/c/a.mp4', size: 1 }, mB = { id: 'v_bbbbbbbb', name: 'Also here', path: '/saves/images/video/c/b.mp4', size: 2 };
    const merged = V.mergeVideos([mA, mB], [{ id: 'v_bbbbbbbb', name: 'From the file', path: '/saves/images/video/c/b2.mp4', size: 3 }, { id: 'v_cccccccc', name: T, path: '/saves/images/video/c/c.webm', size: 4, evil: 1 }, { id: 'v_dddddddd', name: 'Same file as A', path: '/saves/images/video/c/a.mp4', size: 5 }, { id: 'bad', path: 'https://evil.example/x.mp4', size: 1 }, null]);
    check('an imported library joins the one here (mergeVideos): an entry with an id already here replaces it in its place, a new one follows, each cleaned (nothing else riding along, never a web address), a file listed once (the one here stays), 100 at most; no list on either side is an empty one',
        j(merged) === j([mA, { id: 'v_bbbbbbbb', name: 'From the file', path: '/saves/images/video/c/b2.mp4', size: 3 }, { id: 'v_cccccccc', name: T, path: '/saves/images/video/c/c.webm', size: 4 }])
        && j(V.mergeVideos(null, [mA])) === j([mA]) && j(V.mergeVideos([mA], 'x')) === j([mA]) && j(V.mergeVideos(undefined, undefined)) === '[]' && V.mergeVideos(many, many).length === 100 && j(V.mergeVideos([mA, mB], [])) === j([mA, mB]), j(merged));
    check('an import brings a video library in cleaned (source): a campaign new to this machine has its own cleaned as a load would, and one merged into a campaign already here joins that campaign\'s by id; both only through videocore',
        /if \(ic\.videos !== undefined && window\.wpVideoCore\) \{ var vdN = window\.wpVideoCore\.cleanVideos\(ic\.videos\); if \(vdN\.length\) ic\.videos = vdN; else delete ic\.videos; \}/.test(read('system/app/scripts/main.js'))
        && /if \(Array\.isArray\(ic\.videos\) && window\.wpVideoCore && window\.wpVideoCore\.mergeVideos\) \{ var vdM = window\.wpVideoCore\.mergeVideos\(existing\.videos, ic\.videos\); if \(vdM\.length\) existing\.videos = vdM; else delete existing\.videos; \}/.test(read('system/app/scripts/main.js'))
        && (read('system/app/scripts/main.js').match(/\.videos\b/g) || []).length === 9);

    /* ---- the name a file is uploaded under, and the local server taking it ---- */
    const main = read('system/resources/app/main.js');
    let serverName = null; try { serverName = require('../system/resources/app/reqguard.js').safeFileName; } catch (e) { serverName = null; }   // the rule both servers take a new file's name by (reqguard.js)
    const names = ['My Clip (final).MP4', 'a/b\\c?d#e%f.webm', '..\\..\\evil.mp4', '.hidden.mov', 'con:*"<>|.m4v', 'tab\there.ogv', 'Überfahrt nach Hause.mp4', '😀'.repeat(120) + '.mp4', 'x'.repeat(300) + '.webm', '...mp4', ' spaced .mp4 ', 'a..b...c.mp4'];
    const disk = names.map(V.diskName);
    check('the name a video is uploaded under: its own name with separators, ?, #, %, spaces, control characters and a walk as _, no leading dot, cut to 80 code points, its extension in lower case; a file that is not a video by name gets none',
        j(disk.slice(0, 4)) === j(['My_Clip_(final).mp4', 'a_b_c_d_e_f.webm', 'evil.mp4', 'hidden.mov']) && disk[5] === 'tab_here.ogv' && disk[6] === 'Überfahrt_nach_Hause.mp4' && Array.from(disk[7]).length === 84 && disk[8] === 'x'.repeat(80) + '.webm' && disk[9] === 'video.mp4' && disk[10] === 'spaced_.mp4' && disk[11] === 'a_b_c.mp4'
        && ['x.mkv', 'x.mp4.exe', 'x.html', 'mp4', '', null, 5].every(n => V.diskName(n) === ''), j(disk));
    check('every name it gives is one the local server takes (the shell\'s own safeFileName, reqguard.js, which the upload route asks through freshKind) and, behind the server\'s prefix, an uploaded video\'s path',
        typeof serverName === 'function' && disk.every(n => serverName(n) && V.isVideoPath('/saves/images/video/camp_1/k3j9a0pq_' + n)) && !serverName('x.html') && !serverName('.x.mp4') && /const kind = reqguard\.freshKind\(mapId, rawName\);/.test(main), typeof serverName === 'function' ? j(disk.filter(n => !serverName(n) || !V.isVideoPath('/saves/images/video/camp_1/k3j9a0pq_' + n))) : 'no reqguard.js');
    check('the name an upload shows: the file\'s own without its extension or the server\'s prefix, cleaned; nothing gives the default',
        V.nameOf('Opening Crawl.mp4') === 'Opening Crawl' && V.nameOf('k3j9a0pq_Clip.webm') === 'Clip' && V.nameOf('.mp4') === 'Video' && V.nameOf(null) === 'Video' && V.nameOf('a' + String.fromCharCode(0) + 'b.mov') === 'a b');
    let seq = 0; const rnd = () => ((seq++ * 7) % 36) / 36;
    const id1 = V.newId(rnd), taken = {}; taken[id1] = 1; seq = 0;
    check('a new id is v_ and 8 of a-z and 0-9, never one already taken; with every try taken, none', /^v_[a-z0-9]{8}$/.test(id1) && V.newId(() => 0.99999) === 'v_99999999' && (seq = 0, V.newId(rnd, taken)) !== id1 && V.newId(() => 0, { v_aaaaaaaa: 1 }) === null && V.cleanVideo(Object.assign({}, e0, { id: id1 })) !== null, id1);
    check('the panel\'s words: a size in KB, MB or GB, a length as m:ss or h:mm:ss, the library\'s line with its count and bytes',
        V.fmtSize(512) === '1 KB' && V.fmtSize(5 * 1048576) === '5.0 MB' && V.fmtSize(250 * 1048576) === '250 MB' && V.fmtSize(1.5 * 1073741824) === '1.5 GB' && V.fmtSize(12 * 1073741824) === '12 GB'
        && V.fmtDur(0) === '0:00' && V.fmtDur(94.6) === '1:35' && V.fmtDur(3725) === '1:02:05' && V.fmtDur('x') === '0:00'
        && V.sumLine([]) === 'No videos yet' && V.sumLine([{ size: 1048576 }]) === '1 video · 1.0 MB in your saves folder' && V.sumLine([{ size: 1048576 }, { size: 1048576 }]) === '2 videos · 2.0 MB in your saves folder');
    const vcSrc = read('system/app/scripts/videocore.js');
    check('what videocore publishes on window is what it exports', /var API = \{[^}]*cleanVideos: cleanVideos[^}]*\};\nif \(typeof window !== 'undefined'\) window\.wpVideoCore = API;/.test(vcSrc) && Object.keys(V).filter(k => k !== 'default').every(k => new RegExp('\\b' + k + ': ' + k + '\\b').test(vcSrc)));

    /* ---- the panel's own rules, sliced from video.js and run for real ---- */
    const vjs = read('system/app/scripts/video.js');
    const state = { appState: { campaigns: {} } };
    const ours = new Function('state', 'safeId', sliceOf(vjs, 'ours') + NL + 'return fileIsOnlyOurs;')(state, V.safeId);
    const cA = { id: 'camp_a', videos: [{ path: '/saves/images/video/camp_a/k_x.mp4' }, { path: '/saves/images/video/camp_a/k_shared.mp4' }] }, cB = { id: 'camp_b', videos: [{ path: '/saves/images/video/camp_a/k_shared.mp4' }] }, cC = { id: 'camp_c', videos: 'x' };
    state.appState.campaigns = { camp_a: cA, camp_b: cB, camp_c: cC, junk: null };
    check('a file is deleted only when it sits in this campaign\'s own folder and no other campaign lists it (a copied campaign keeps its video); a path in another campaign\'s folder takes only the entry',
        ours(cA, '/saves/images/video/camp_a/k_x.mp4') === true && ours(cA, '/saves/images/video/camp_a/k_shared.mp4') === false && ours(cB, '/saves/images/video/camp_a/k_shared.mp4') === false && ours(cA, '/saves/images/video/camp_ab/k_x.mp4') === false);
    const clamp = new Function('window', sliceOf(vjs, 'clamp') + NL + 'return { clampW: clampW, clampH: clampH };')({ innerWidth: 1000, innerHeight: 700 });
    check('the corner resizes within the window, never below 300 by 200', clamp.clampW(10) === 300 && clamp.clampW(5000) === 992 && clamp.clampW(640.4) === 640 && clamp.clampH(-50) === 200 && clamp.clampH(900) === 692 && clamp.clampH(360.6) === 361);
    check('adding videos (source): one at a time; a file that is not a video by name refused before anything else, the campaign\'s 100 kept, each checked by this app\'s own player first (none that cannot play, none with no picture), written to video/<the campaign\'s safe id> with a progress line, its entry cleaned before it joins the library, then saved',
        /if \(!camp \|\| !canWrite\(\) \|\| !featureOn\(\) \|\| uploading\) return;/.test(vjs) && /var folder = 'video\/' \+ safeId\(camp\.id\)/.test(vjs) && /if \(!disk\) \{ refused\.push\(f\.name \+ ' \(not a video file/.test(vjs)
        && vjs.indexOf('if (!disk)') < vjs.indexOf('probe(f).then(') && vjs.indexOf('if (!pr.ok)') < vjs.indexOf('return putFile(folder, disk, f,') && /if \(list\.length >= 100\)/.test(vjs)
        && /fin\(\{ ok: v\.videoWidth > 0 && v\.videoHeight > 0/.test(vjs) && /var entry = cleanVideo\(\{ id: newId\(Math\.random, taken\), name: nameOf\(f\.name\), path: url, size: f\.size, dur: pr\.dur, w: pr\.w, h: pr\.h \}\);/.test(vjs)
        && /if \(!entry\) \{ refused\.push/.test(vjs) && /cur\.push\(entry\); added\+\+; save\(true\); next\(\);/.test(vjs) && /if \(x\.status === 200 && d && isVideoPath\(d\.url\)\) resolve\(d\.url\)/.test(vjs) && /x\.upload\.onprogress = /.test(vjs));
    check('the panel (source): the GM\'s alone (never at someone else\'s table or in the stream window), the library read cleaned and written back cleaned, a rename cleaned, a deletion asked first and the file deleted only when it is only ours, closing it stops and unloads the video, full screen for the picture alone',
        /function canWrite\(\) \{ return !!\(window\.wpCanPersistLocal && window\.wpCanPersistLocal\(\)\) && !window\.wpStream; \}/.test(vjs) && /if \(!panelOpen \|\| !camp \|\| !canWrite\(\)\)/.test(vjs)
        && /function lib\(camp\) \{ camp = camp \|\| getActiveCampaign\(\); return camp \? cleanVideos\(camp\.videos\) : \[\]; \}/.test(vjs) && /camp\.videos = cleanVideos\(camp\.videos\); return camp\.videos;/.test(vjs)
        && /var name = cleanName\(value, v\.name\);/.test(vjs) && /showConfirm\(ours \? 'Delete "' \+ v\.name/.test(vjs) && /if \(!ours\) \{ toast\('Taken out of this campaign\.'\); return; \}/.test(vjs)
        && /function closePanel\(\) \{\n    panelOpen = false; hideVideo\(\);/.test(vjs) && /el\.removeAttribute\('src'\); try \{ el\.load\(\); \}/.test(vjs) && /stage\.requestFullscreen\(\)/.test(vjs));
    check('full screen (source): the picture alone; where the window refuses it or never answers within 1.2 s the panel fills the app\'s window instead (no drag, no list, no corner), the button and Esc step back from it, hiding the video leaves it',
        /stage\.requestFullscreen\(\)\.then\(function\(\) \{ settled = true; \}, function\(\) \{ settled = true; setMax\(true\); \}\);/.test(vjs) && /setTimeout\(function\(\) \{ if \(!settled && !document\.fullscreenElement && hasPicture\(\)\) setMax\(true\); \}, 1200\);/.test(vjs)
        && /if \(p\.classList\.contains\('vid-max'\)\) \{ setMax\(false\); return; \}/.test(vjs) && /if \(p\.classList\.contains\('vid-max'\)\) \{ e\.stopPropagation\(\); setMax\(false\); return; \}/.test(vjs)
        && /function hideVideo\(\) \{\n(?:    [^\n]*\n)*    setMax\(false\);\n\}/.test(vjs) && /function leaveFull\(\) \{\n(?:    [^\n]*\n)*    setMax\(false\);\n\}/.test(vjs)
        && /if \(e\.target\.closest\('button'\) \|\| p\.classList\.contains\('vid-max'\)\) return;/.test(vjs)
        && /#videoPanel\.vid-max \{ left: 0 !important; top: 0 !important; right: auto; width: 100vw !important; height: 100vh !important;/.test(read('system/app/style.css')) && /#videoPanel\.vid-max #videoBody, #videoPanel\.vid-max \.video-resize, #videoPanel\.vid-max \.video-caption \{ display: none; \}/.test(read('system/app/style.css')));

    /* ---- V2: a video shown live to the table ---- */
    check('V2 what each viewer is sent at most (sendCap): the picture\'s long side down to 1280 (a portrait one too), 30 frames a second, 2.5 Mbit/s, 1 Mbit/s only when it is said to travel through a relay; a size that is no number scales nothing',
        j(V.sendCap(1920, 1080, false)) === j({ scaleResolutionDownBy: 1.5, maxFramerate: 30, maxBitrate: 2500000 }) && V.sendCap(1280, 720).scaleResolutionDownBy === 1 && V.sendCap(640, 360).scaleResolutionDownBy === 1 && V.sendCap(1080, 1920).scaleResolutionDownBy === 1.5
        && j(V.sendCap(3840, 2160, true)) === j({ scaleResolutionDownBy: 3, maxFramerate: 30, maxBitrate: 1000000 }) && V.sendCap(1000, 1000, 'yes').maxBitrate === 2500000 && V.sendCap(1000, 1000, 1).maxBitrate === 2500000
        && ['x', NaN, null, undefined, -5, 1e9, '1920'].every(w => V.sendCap(w, w).scaleResolutionDownBy === 1) && V.sendCap(2000, 'x').scaleResolutionDownBy === 1.563);
    const sdpA = ['v=0', 'm=audio 9 UDP/TLS/RTP/SAVPF 111 63', 'a=rtpmap:111 opus/48000/2', 'a=fmtp:111 minptime=10;useinbandfec=1', 'a=rtpmap:63 red/48000/2', 'a=fmtp:63 111/111', 'm=video 9 UDP/TLS/RTP/SAVPF 96', 'a=rtpmap:96 VP8/90000', 'a=fmtp:96 x=1', ''].join('\r\n');
    const sdpS = V.stereoSdp(sdpA);
    check('V2 a viewer\'s answer asks for its sound in stereo at a music bitrate (stereoSdp): added to the Opus line\'s own parameters and to no other line, line endings kept; unchanged when it already speaks of stereo, has no Opus line or no parameters for it; anything that is no text is handed back as it is',
        sdpS === sdpA.replace('a=fmtp:111 minptime=10;useinbandfec=1', 'a=fmtp:111 minptime=10;useinbandfec=1;stereo=1;maxaveragebitrate=128000') && sdpS.split('\r\n').length === sdpA.split('\r\n').length && V.stereoSdp(sdpS) === sdpS
        && V.stereoSdp(sdpA.replace('useinbandfec=1', 'useinbandfec=1;stereo=0')) === sdpA.replace('useinbandfec=1', 'useinbandfec=1;stereo=0') && V.stereoSdp('v=0\r\nm=video 9\r\na=rtpmap:96 VP8/90000\r\na=fmtp:96 x=1\r\n') === 'v=0\r\nm=video 9\r\na=rtpmap:96 VP8/90000\r\na=fmtp:96 x=1\r\n'
        && V.stereoSdp('a=rtpmap:111 opus/48000/2\r\n') === 'a=rtpmap:111 opus/48000/2\r\n'
        && V.stereoSdp('a=rtpmap:96 VP8/90000\r\na=fmtp:96 x=1\r\na=rtpmap:109 opus/48000/2\r\na=fmtp:109 minptime=10\r\n') === 'a=rtpmap:96 VP8/90000\r\na=fmtp:96 x=1\r\na=rtpmap:109 opus/48000/2\r\na=fmtp:109 minptime=10;stereo=1;maxaveragebitrate=128000\r\n' && V.stereoSdp(sdpA.replace(/\r\n/g, NL)) === sdpS.replace(/\r\n/g, NL) && V.stereoSdp(null) === null && V.stereoSdp(5) === 5 && V.stereoSdp('') === '');
    const PL = new Function(sliceOf(vjs, 'players') + NL + 'return { tablePlayers: tablePlayers, audienceOf: audienceOf, liveWords: liveWords };')();
    const hostNet = { active: true, role: 'host', roster: { pA: { id: 'u_a', name: 'Ann' }, pA2: { id: 'u_a', name: 'Ann again' }, pB: { id: 'u_b' }, pX: { id: '' }, pY: null, pZ: { id: 5, name: 'Five' }, pP: { id: '__proto__', name: T } } };
    const players = PL.tablePlayers(hostNet);
    check('V2 the Show to ticks (tablePlayers, run for real): the players connected, one row a profile (the first connection\'s name, Player for none), never an entry with no profile id; a profile named like a built-in is a row like any other; nobody on a player\'s machine or with no table',
        j(players) === j([{ id: 'u_a', name: 'Ann' }, { id: 'u_b', name: 'Player' }, { id: '__proto__', name: T }]) && j(PL.tablePlayers(Object.assign({}, hostNet, { role: 'client' }))) === '[]' && j(PL.tablePlayers(Object.assign({}, hostNet, { active: false }))) === '[]' && j(PL.tablePlayers(null)) === '[]' && j(PL.tablePlayers({ active: true, role: 'host' })) === '[]', j(players));
    check('V2 who a showing goes to (audienceOf): everyone unless Everyone is unticked; then the ticked players among those connected (a tick is true only, by the profile\'s own key), in their order; none ticked is nobody',
        PL.audienceOf({ all: true, pids: { $u_a: true } }, players) === null && PL.audienceOf(null, players) === null && PL.audienceOf({ pids: {} }, players) === null && j(PL.audienceOf({ all: false, pids: { $u_b: true, $u_a: true, $u_gone: true, u_b: true } }, players)) === j(['u_a', 'u_b'])
        && j(PL.audienceOf({ all: false, pids: { $u_a: 1, $u_b: 'yes' } }, players)) === '[]' && j(PL.audienceOf({ all: false }, players)) === '[]' && j(PL.audienceOf({ all: false, pids: { $__proto__: true } }, players)) === j(['__proto__']));
    check('V2 the showing\'s line (liveWords): who is being sent it, then who of its audience it is waiting for; alone when nobody is connected',
        PL.liveWords(true, ['Ann', 'Bo'], []) === 'Showing to everyone: Ann, Bo' && PL.liveWords(true, ['Ann'], ['Cy']) === 'Showing to everyone: Ann. Waiting for: Cy' && PL.liveWords(true, [], ['Ann', 'Cy']) === 'Showing to everyone. Waiting for: Ann, Cy' && PL.liveWords(true, [], []) === 'Showing to everyone (nobody is connected yet)'
        && PL.liveWords(false, ['Ann'], []) === 'Showing to the players you ticked: Ann' && PL.liveWords(false, [], ['Cy']) === 'Showing to the players you ticked. Waiting for: Cy' && PL.liveWords(false, [], []) === 'Showing to the players you ticked (none of them is connected)' && PL.liveWords(true) === 'Showing to everyone (nobody is connected yet)');
    const audT = { all: false, pids: {} }; ['u_a', 'u_b', '__proto__'].forEach(id => { audT.pids['$' + id] = true; }); audT.pids['$u_b'] = false;   // as the handler writes a tick and an untick
    check('V2 the ticks (source, and the audience they give): the audience starts as everyone; a tick writes true or false under the profile\'s own key, Everyone its own flag; the row is drawn from the same keys; so an unticked player is never in the audience and a ticked one is',
        /var aud = \{ all: true, pids: \{\} \};/.test(vjs) && /else if \(t\.classList\.contains\('vid-all'\)\) aud\.all = !!t\.checked;/.test(vjs) && /else if \(t\.classList\.contains\('vid-who'\) && typeof t\.dataset\.pid === 'string'\) aud\.pids\['\$' \+ t\.dataset\.pid\] = !!t\.checked;/.test(vjs)
        && /all: live \? !!\(who && who\.all\) : aud\.all !== false,/.test(vjs) && /on: aud\.pids\['\$' \+ p\.id\] === true/.test(vjs)
        && j(PL.audienceOf(audT, players)) === j(players.filter(p => audT.pids['$' + p.id] === true).map(p => p.id)) && j(PL.audienceOf(audT, players)) === j(['u_a', '__proto__']) && PL.audienceOf(Object.assign({}, audT, { all: true }), players) === null);
    check('V2 the row keeps the keyboard\'s place across a redraw (source): its one button, Show or Stop, a tick found by its profile (never a selector built from an id), Everyone, Loop; nothing disabled is focused',
        /back = !cl \? '' : \(cl\.contains\('vid-go'\) \|\| cl\.contains\('vid-stop'\)\) \? '\.vid-go, \.vid-stop' : cl\.contains\('vid-all'\) \? '\.vid-all' : cl\.contains\('vid-loop'\) \? '\.vid-loop' : '';/.test(vjs)
        && /var again = pid !== null \? Array\.prototype\.find\.call\(box\.querySelectorAll\('\.vid-who'\), function\(x\) \{ return x\.dataset\.pid === pid; \}\) : back \? box\.querySelector\(back\) : null;\n    if \(again && !again\.disabled\) again\.focus\(\);/.test(vjs) && !/querySelector\('[^']*' \+/.test(vjs));
    check('V2 showing it (source): only the GM\'s own staged video, while hosting with Video on, from a loaded element with no error (one at its end goes back to the start), to everyone or at least one ticked player, from a fresh capture that holds a picture (else its tracks are stopped and nothing is shown); net.videoShow is given the stream, the name, the audience and the picture\'s size',
        /if \(!v \|\| !el \|\| live \|\| !canWrite\(\) \|\| !featureOn\(\)\) return;\n    if \(!hosting\(\) \|\| !n\.videoShow\) \{/.test(vjs) && /if \(el\.error\) \{ toast\(/.test(vjs) && /if \(el\.readyState < 1\) \{ toast\(/.test(vjs) && /if \(el\.ended\) \{ try \{ el\.currentTime = 0; \}/.test(vjs)
        && /var pids = audienceOf\(aud, tablePlayers\(n\)\);\n    if \(pids && !pids\.length\) \{ toast\('Tick at least one player, or Everyone\.'\); return; \}/.test(vjs) && /if \(!cap \|\| !cap\.getVideoTracks\(\)\.length\) \{ stopTracks\(cap\); toast\(/.test(vjs)
        && /var who = n\.videoShow\(cap, v\.name, pids, el\.videoWidth, el\.videoHeight\);\n    if \(!who\) \{ stopTracks\(cap\); toast\(/.test(vjs) && /live = \{ id: v\.id, cap: cap \};/.test(vjs) && vjs.indexOf('var cap = null; try { cap = el.captureStream(); }') > vjs.indexOf('if (el.readyState < 1)'));
    check('V2 a showing stops (source) — the links closed through net.videoStop and the capture\'s tracks stopped — when the GM presses Stop, when the video ends (Loop is the element\'s own loop, so with it there is no end), when its file fails, when another video takes the stage (never shown by itself: a wrong click reveals nothing), when the stage is emptied or the panel closed, when the table is no longer up or is left',
        /function stopShowing\(why\) \{\n    if \(!live\) return;\n    var l = live, n = netOf\(\); live = null;\n    if \(n && n\.videoStop\) n\.videoStop\(\);\n    stopTracks\(l\.cap\);/.test(vjs)
        && /else if \(b\.classList\.contains\('vid-stop'\)\) stopShowing\('No longer showing to players\.'\);/.test(vjs) && /el\.addEventListener\('ended', function\(\) \{ stopShowing\(/.test(vjs) && /stopShowing\('The video could not be played: no longer showing to players\.'\);/.test(vjs)
        && /if \(live && live\.id !== v\.id\) stopShowing\('No longer showing to players: press Show to players for this one\.'\);/.test(vjs) && vjs.indexOf('if (live && live.id !== v.id) stopShowing(') < vjs.indexOf('if (el.getAttribute(\'src\') !== src) el.src = src;')
        && /function hideVideo\(\) \{\n    var el = ui\('videoEl'\), stage = ui\('videoStage'\);\n    stopShowing\(\);/.test(vjs) && /if \(live && !hosting\(\)\) stopShowing\(/.test(vjs) && /function tableLeft\(\) \{[^\n]*\n    stopShowing\(\);\n    closeWatch\(\);/.test(vjs)
        && /if \(el\.getAttribute\('src'\) !== src\) el\.src = src;\n    el\.loop = loop;/.test(vjs) && /if \(t\.classList\.contains\('vid-loop'\)\) \{ loop = !!t\.checked; el\.loop = loop; \}/.test(vjs) && !/addEventListener\('ended', function\(\) \{[^\n]*play\(/.test(vjs));

    /* ---- V2, a player's side: the watch mode of the same panel, sliced from video.js and run on a page of plain objects ---- */
    const mkEl = () => { const cls = new Set(), e = { style: {}, attrs: {}, textContent: '', value: '', title: '', disabled: false, kids: {},
        classList: { toggle: (c, on) => { if (on) cls.add(c); else cls.delete(c); }, remove: (...c) => c.forEach(x => cls.delete(x)), add: c => cls.add(c), contains: c => cls.has(c) },
        setAttribute: (k, v) => { e.attrs[k] = v; }, getAttribute: k => e.attrs[k], querySelector: sel => e.kids[sel] || null }; return e; };
    const mkWatch = o => {
        o = o || {};
        const els = { videoPanel: mkEl(), videoChip: mkEl(), videoStage: mkEl(), videoCaption: mkEl(), videoMuteBtn: mkEl(), videoVol: mkEl(), videoWatchNote: mkEl(), videoFullBtn: mkEl() };
        els.videoChip.kids['.vchip-txt'] = mkEl(); els.videoPanel.style.display = 'none'; els.videoStage.style.display = 'none';
        const log = { sets: 0, plays: 0, pauses: 0, placed: 0, leftFull: 0 }, prefs = Object.assign({}, o.prefs), w = { net: { role: o.role || 'client' }, on: o.on !== false, reject: o.reject || null };
        const vl = { muted: false, volume: 1, paused: true, _src: null, play: () => { log.plays++; vl.paused = false; return w.reject && !vl.muted ? Promise.reject({ name: w.reject }) : Promise.resolve(); }, pause: () => { log.pauses++; vl.paused = true; } };
        Object.defineProperty(vl, 'srcObject', { get: () => vl._src, set: v => { log.sets++; vl._src = v; } });
        els.videoLive = vl;
        const api = new Function('ui', 'pref', 'setPref', 'netOf', 'featureOn', 'cleanName', 'placePanel', 'leaveFull', 'document', 'window',
            'var watch = null, panelOpen = false, lastSig = "x";' + NL + sliceOf(vjs, 'watch') + NL + 'return { onStream: onStream, onLost: onLost, closeWatch: closeWatch, setWatchOpen: setWatchOpen, volNow: volNow, mutedNow: mutedNow, applySound: applySound, watch: function() { return watch; } };')(
            id => els[id] || null, (k, d) => (k in prefs ? prefs[k] : d), (k, v) => { prefs[k] = String(v); }, () => w.net, () => w.on, V.cleanName, () => { log.placed++; }, () => { log.leftFull++; }, { activeElement: null }, { wpStream: !!o.streamWin });
        return { els, log, prefs, w, vl, api };
    };
    const wait = () => new Promise(r => setTimeout(r, 0));
    const s1 = { id: 1 }, s2 = { id: 2 };
    const WA = mkWatch(); WA.api.onStream(s1, 'The\u0000 <b>reveal</b>'); WA.api.onStream(s1, 'The\u0000 <b>reveal</b>'); await wait();
    check('V2 a player\'s panel (onStream, run for real): the GM\'s stream handed over twice is set once, the panel opens in its place in watch mode with the stage, the name cleaned and written as text in the caption and in the header\'s chip, the chip shown and pressed, sound as the player left it, and it plays',
        WA.log.sets === 1 && WA.vl.srcObject === s1 && WA.els.videoPanel.style.display === 'flex' && WA.els.videoPanel.classList.contains('vid-watch') && WA.els.videoStage.style.display === '' && WA.els.videoCaption.textContent === 'The <b>reveal</b>' && WA.els.videoChip.kids['.vchip-txt'].textContent === 'The <b>reveal</b>'
        && WA.els.videoChip.style.display === '' && WA.els.videoChip.attrs['aria-pressed'] === 'true' && WA.log.placed === 1 && WA.log.plays >= 1 && WA.vl.muted === false && WA.vl.volume === 1 && WA.els.videoFullBtn.disabled === false && WA.els.videoWatchNote.textContent === '' && WA.api.watch().forced === false, j([WA.log, WA.els.videoCaption.textContent]));
    WA.api.setWatchOpen(false); const closed = [WA.els.videoPanel.style.display, WA.vl.paused, WA.els.videoChip.style.display, WA.els.videoChip.attrs['aria-pressed'], WA.log.leftFull, WA.els.videoFullBtn.disabled, !!WA.api.watch()];
    WA.api.setWatchOpen(true); const reopened = [WA.els.videoPanel.style.display, WA.vl.paused, WA.els.videoChip.attrs['aria-pressed']];
    WA.api.onStream(s2, 'Next'); await wait(); const swapped = [WA.log.sets, WA.vl.srcObject === s2, WA.vl.muted, WA.els.videoCaption.textContent];
    WA.api.onLost(); const lostCap = WA.els.videoCaption.textContent, lostNote = WA.els.videoWatchNote.textContent; WA.api.onStream(s2, 'Next'); const backCap = WA.els.videoCaption.textContent, backNote = WA.els.videoWatchNote.textContent;
    WA.api.closeWatch(); const ended = [WA.vl.srcObject, WA.els.videoPanel.style.display, WA.els.videoStage.style.display, WA.els.videoChip.style.display, WA.els.videoPanel.classList.contains('vid-watch'), WA.api.watch()]; WA.api.closeWatch(); WA.api.onLost();
    check('V2 closing the panel silences it and keeps the chip (which reopens it, playing again); a new stream of the same showing replaces the picture; a picture that stops coming is said in the caption and in the sound bar (full screen shows only the bar) until it is back; the GM\'s stop takes the stream, the panel, the stage and the chip away',
        j(closed) === j(['none', true, '', 'false', 1, true, true]) && j(reopened) === j(['flex', false, 'true']) && j(swapped) === j([2, true, false, 'Next']) && /stopped coming/.test(lostCap) && /stopped coming/.test(lostNote) && backCap === 'Next' && backNote === '' && j(ended) === j([null, 'none', 'none', 'none', false, null]), j([closed, reopened, swapped, lostCap, lostNote, backNote, ended]));
    const WN = mkWatch({ reject: 'NotAllowedError' }); WN.api.onStream(s1, 'x'); await wait(); await wait();
    const WB = mkWatch({ reject: 'AbortError' }); WB.api.onStream(s1, 'x'); await wait(); await wait();
    const WP = mkWatch({ prefs: { wp_videoVol: '40', wp_videoMuted: '1' } }); WP.api.onStream(s1, 'x'); await wait();
    check('V2 a window that refuses to play with sound (that refusal alone) starts it silent and says so; a play cut short by anything else mutes nothing; the player\'s own mute and volume are kept from one showing to the next, the volume read as 0 to 100',
        WN.vl.muted === true && WN.api.watch().forced === true && /press the speaker/.test(WN.els.videoWatchNote.textContent) && WN.els.videoMuteBtn.attrs['aria-pressed'] === 'true' && WN.log.plays === 2
        && WB.vl.muted === false && WB.api.watch().forced === false && WB.els.videoWatchNote.textContent === '' && WB.log.plays === 1 && WP.vl.muted === true && WP.vl.volume === 0.4 && WP.els.videoMuteBtn.attrs['aria-pressed'] === 'true' && WP.els.videoVol.value === '40'
        && [['x', 100], ['250', 100], ['-5', 0], ['37.9', 37], [undefined, 100]].every(p => mkWatch({ prefs: p[0] === undefined ? {} : { wp_videoVol: p[0] } }).api.volNow() === p[1]), j([WN.vl.muted, WN.log, WB.vl.muted, WB.log, WP.vl.volume]));
    const notShown = [mkWatch({ role: 'host' }), mkWatch({ streamWin: true }), mkWatch({ on: false })].map(s => { s.api.onStream(s1, 'x'); return [s.log.sets, s.els.videoPanel.style.display, !!s.api.watch()]; });
    const noStream = mkWatch(); noStream.api.onStream(null, 'x');
    check('V2 a stream is shown only on a player\'s machine with their own Video on, never on the GM\'s, in the stream window or with nothing handed over; the panel\'s other entrances follow it (source): a render leaves a watching panel to its watch mode, the head\'s close and Esc close the watching panel only, full screen takes the picture of either, a Video switched off here drops the link and closes it, switched on again asks for a showing not taken',
        j(notShown) === j([[0, 'none', false], [0, 'none', false], [0, 'none', false]]) && noStream.log.sets === 0 && !noStream.api.watch()
        && /function render\(force\) \{\n    var p = ui\('videoPanel'\); if \(!p\) return;\n    if \(watch\) \{ renderWatch\(\); return; \}/.test(vjs) && /ui\('videoCloseBtn'\)\.addEventListener\('click', function\(\) \{ if \(watch\) setWatchOpen\(false\); else closePanel\(\); \}\);/.test(vjs)
        && /if \(p\.contains\(document\.activeElement\)\) \{ if \(watch\) setWatchOpen\(false\); else closePanel\(\); \}/.test(vjs) && /function hasPicture\(\) \{ return !!\(showing \|\| \(watch && watch\.open\)\); \}/.test(vjs)
        && /if \(!featureOn\(\) \|\| !n \|\| !n\.active \|\| n\.role !== 'client'\) \{ if \(n && n\.videoDrop\) n\.videoDrop\(\); closeWatch\(\); \}/.test(vjs) && /if \(n && n\.active && n\.role === 'client' && n\.videoWake && featureOn\(\)\) n\.videoWake\(\);/.test(vjs)
        && /if \(chip\) chip\.addEventListener\('click', function\(\) \{ if \(watch\) setWatchOpen\(!watch\.open\); \}\);/.test(vjs) && /close: function\(\) \{ if \(!watch\) closePanel\(\); \}/.test(vjs)
        && !/panelOpen\s*=[^=]/.test(sliceOf(vjs, 'watch')) && read('system/app/style.css').includes('.hdr-clock.hdr-video { max-width: 170px; }'), j(notShown));

    /* ---- wired into the page, the features, the render and the documents ---- */
    const ix = read('system/app/index.html'), vt = read('system/app/scripts/vtt.js'), mn = read('system/app/scripts/main.js'), tu = read('system/app/scripts/tutorial.js'), ci = read('CAMPAIGN_INTEGRATION.md'), wn = read('WHATSNEW.txt'), wa = read('system/app/assets/whatsnew.txt'), st = read('system/app/scripts/settings.js');
    const scene = ix.slice(ix.indexOf('<div class="shape-menu" id="sceneFxMenu"'), ix.indexOf('</div>', ix.indexOf('<div class="shape-menu" id="sceneFxMenu"')));
    check('the page: videocore loads before the app\'s main module (the load cleans with it), video.js after Music; the Video button in the Scene menu; the panel with its head, full screen and close, the stage and its video, the body, the file picker for video files and the corner',
        ix.indexOf('src="scripts/videocore.js"') > 0 && ix.indexOf('src="scripts/videocore.js"') < ix.indexOf('src="scripts/main.js"') && ix.indexOf('src="scripts/video.js"') > ix.indexOf('src="scripts/music.js"')
        && /id="videoBtn"/.test(scene) && ['videoPanel', 'videoHead', 'videoFullBtn', 'videoCloseBtn', 'videoStage', 'videoEl', 'videoCaption', 'videoBody', 'videoResize'].every(id => ix.indexOf('id="' + id + '"') > 0)
        && ix.includes('<input type="file" id="videoFile" accept=".mp4,.m4v,.webm,.ogv,.mov,video/*" multiple style="display:none;">') && ix.includes('<video id="videoEl" controls playsinline preload="metadata"></video>'));
    const css = read('system/app/style.css');
    check('V2 the page: the stage\'s table row between the stage and the list; a player\'s picture a second video element with no controls and no address of its own, their sound bar (mute, volume, a note) and the header\'s chip, all hidden until a showing; in watch mode the list, the table row and the GM\'s own player are hidden, and out of it the player\'s picture and sound bar',
        ix.indexOf('id="videoTable"') > ix.indexOf('id="videoStage"') && ix.indexOf('id="videoTable"') < ix.indexOf('id="videoBody"') && ix.includes('<video id="videoLive" playsinline></video>') && !/<video id="videoLive"[^>]*(controls|src=)/.test(ix)
        && ['videoWatchBar', 'videoMuteBtn', 'videoVol', 'videoWatchNote', 'videoChip'].every(id => ix.indexOf('id="' + id + '"') > 0) && /<button class="tool ghost hdr-clock hdr-video" id="videoChip" style="display:none;" aria-pressed="false"/.test(ix) && /<div id="videoTable" style="display:none;"><\/div>/.test(ix)
        && css.includes('#videoPanel.vid-watch #videoBody, #videoPanel.vid-watch #videoTable, #videoPanel.vid-watch #videoEl { display: none !important; }') && css.includes('#videoPanel:not(.vid-watch) #videoLive, #videoPanel:not(.vid-watch) .video-watchbar { display: none; }'));
    check('the feature: Video last in the list, on by default, a player\'s own switch; its Settings row and its default row; its words when switched; the app\'s render keeps the panel in step after the clock',
        /\{ id: 'video',     label: 'Video',            legacyKey: null \}/.test(vt) && ix.includes('<div class="set-vtt-row" data-vtt="video"') && ix.includes('id="setVideoBtn"') && ix.includes('id="setVideoState"') && ix.includes('id="setVttGlobalVideoBtn"') && ix.includes('id="setVttGlobalVideoState"')
        && /    video: \['Video on/.test(st) && /window\.wpCalendar\.refresh\(\);[^\n]*\n      if \(window\.wpVideo && window\.wpVideo\.refresh\) window\.wpVideo\.refresh\(\);/.test(mn));
    // the stream window (before the release, 2026-10-01): the GM's main window says what is shown to players over BroadcastChannel (video.js
    // stageMsg / streamPost, sliced by the streamstage markers) and the stream window plays the same file itself (stream.js streamVideoApply,
    // sliced by the streamwatch markers and run on a page of plain objects)
    {
        const sj = read('system/app/scripts/stream.js');
        const posts = [], chanM = { postMessage: m => posts.push(JSON.parse(j(m))), addEventListener() {} };
        const mkStage = o => { o = o || {}; const el = { currentTime: o.pos === undefined ? 12.34 : o.pos, paused: !!o.paused, ended: !!o.ended, loop: o.loop === undefined ? false : o.loop };
            const api = new Function('BroadcastChannel', 'window', 'canWrite', 'ui', 'lib', 'showing', 'live', 'setInterval', 'clearInterval', sliceOf(vjs, 'streamstage') + NL + 'return { stageMsg: stageMsg, streamPost: streamPost, streamTicking: streamTicking };')(
                function() { return chanM; }, o.stream ? { wpStream: true } : {}, () => o.noWrite !== true, id => (id === 'videoEl' ? el : null), () => [{ id: 'v_abcdefgh', name: 'Docks', path: '/saves/images/video/camp_x/k3j9a0pq_docks.mp4', size: 1 }], o.showing === undefined ? 'v_abcdefgh' : o.showing, o.live === undefined ? { id: 'v_abcdefgh' } : o.live, () => 7, () => {});
            return { api, el }; };
        const s1 = mkStage(); posts.length = 0; s1.api.streamPost(); const m1 = posts[0];
        const s2 = mkStage({ paused: true, loop: true, pos: 3.14159 }); posts.length = 0; s2.api.streamPost(); const m2 = posts[0];
        const s3 = mkStage({ live: null }); posts.length = 0; s3.api.streamPost(); const m3 = posts[0];
        const s4 = mkStage({ showing: null }); posts.length = 0; s4.api.streamPost(); const m4 = posts[0];
        const s5 = mkStage({ stream: true }); posts.length = 0; s5.api.streamPost(); const n5 = posts.length; const s6 = mkStage({ noWrite: true }); posts.length = 0; s6.api.streamPost(); const n6 = posts.length;
        const m7 = s1.api.stageMsg({ id: 'v_1', name: 'X', path: '/p', size: 1 }, { currentTime: 'x', paused: false, ended: true, loop: 1 }, true);
        check('stream window (the GM\'s word, run for real): a showing posts the video\'s id, name and path with the stage\'s position to a tenth, playing (not paused, not ended), its loop as true only and live; paused and looping read so; no showing to players, or nothing on the stage, posts null; the stream window\'s own copy and a machine that cannot write post nothing; a position that is no number is 0, ended is not playing',
            j(m1) === j({ type: 'video-stage', now: { id: 'v_abcdefgh', name: 'Docks', path: '/saves/images/video/camp_x/k3j9a0pq_docks.mp4', pos: 12.3, playing: true, loop: false, live: true } })
            && j(m2.now) === j({ id: 'v_abcdefgh', name: 'Docks', path: '/saves/images/video/camp_x/k3j9a0pq_docks.mp4', pos: 3.1, playing: false, loop: true, live: true }) && j(m3) === j({ type: 'video-stage', now: null }) && j(m4) === j({ type: 'video-stage', now: null })
            && n5 === 0 && n6 === 0 && j(m7.now) === j({ id: 'v_1', name: 'X', path: '/p', pos: 0, playing: false, loop: false, live: true }), j([m1, m2, m3, m4, n5, n6, m7]));
        const apply = new Function(sliceOf(sj, 'streamwatch') + NL + 'return streamVideoApply;')();
        const mkPage = () => { const ev = [], el = { attrs: {}, currentTime: 0, paused: true, muted: true, loop: false, style: {}, getAttribute(k) { return this.attrs[k] === undefined ? null : this.attrs[k]; }, removeAttribute(k) { delete this.attrs[k]; ev.push('rm'); },
            set src(v) { this.attrs.src = v; ev.push('src:' + v); }, get src() { return this.attrs.src || ''; }, play() { this.paused = false; ev.push('play'); return { catch() {} }; }, pause() { this.paused = true; ev.push('pause'); }, load() { ev.push('load'); } };
            return { el, ev, box: { style: { display: 'none' } }, cap: { textContent: '' } }; };
        const good = pos => ({ type: 'video-stage', now: { id: 'v_abcdefgh', name: ' Docks\u0000 <b>x</b> ', path: '/saves/images/video/camp_x/k3j9a0pq_docks.mp4', pos: pos, playing: true, loop: true, live: true } });
        const P1 = mkPage(), r1 = apply(good(12.3), P1.el, P1.box, P1.cap, V, false), st1 = { src: P1.el.src, cap: P1.cap.textContent, loop: P1.el.loop, muted: P1.el.muted, t: P1.el.currentTime, box: P1.box.style.display, ev: P1.ev.slice() };
        P1.ev.length = 0; const r2 = apply(good(13.0), P1.el, P1.box, P1.cap, V, true), st2 = { t: P1.el.currentTime, muted: P1.el.muted, ev: P1.ev.slice() };   // within 1.5 s: no seek; the sound setting on
        P1.ev.length = 0; apply(Object.assign(good(20), { now: Object.assign(good(20).now, { playing: false }) }), P1.el, P1.box, P1.cap, V, true); const st3 = { t: P1.el.currentTime, paused: P1.el.paused, ev: P1.ev.slice() };
        P1.ev.length = 0; const r4 = apply({ type: 'video-stage', now: null }, P1.el, P1.box, P1.cap, V, true), st4 = { src: P1.el.getAttribute('src'), box: P1.box.style.display, cap: P1.cap.textContent, ev: P1.ev.slice() };
        const bad = [{ now: Object.assign(good(1).now, { live: false }) }, { now: Object.assign(good(1).now, { path: 'https://evil.example/x.mp4' }) }, { now: Object.assign(good(1).now, { path: '/saves/images/video/camp_x/../x.mp4' }) }, { now: 'x' }, null, 7, { now: Object.assign(good(1).now, { live: 'true' }) }]
            .map(d => { const P = mkPage(); const r = apply(d, P.el, P.box, P.cap, V, true); return [r, P.el.getAttribute('src'), P.box.style.display, P.ev.join()]; });
        const P5 = mkPage(), r5 = apply(good(1), P5.el, P5.box, P5.cap, null, true);
        check('stream window (the applier, run for real on a page of plain objects): a live showing plays the file by its own encoded address (videoSrc) with the name cleaned to a text node, looping as the GM has it, muted unless the stream sound is on, seeking to the GM\'s position and playing; a position within 1.5 s seeks nothing; the GM pausing pauses here; nothing shown takes the picture down (the source removed, the element unloaded, the box hidden, the caption empty)',
            r1 === true && j(st1) === j({ src: '/saves/images/video/camp_x/k3j9a0pq_docks.mp4', cap: 'Docks <b>x</b>', loop: true, muted: true, t: 12.3, box: '', ev: ['src:/saves/images/video/camp_x/k3j9a0pq_docks.mp4', 'play'] })
            && r2 === true && j(st2) === j({ t: 12.3, muted: false, ev: [] }) && j(st3) === j({ t: 20, paused: true, ev: ['pause'] }) && r4 === false && j(st4) === j({ src: null, box: 'none', cap: '', ev: ['pause', 'rm', 'load'] }), j([st1, st2, st3, st4]));
        check('stream window (the applier): a showing that is not live (false, or "true"), a path that is a web address or walks out of the folder, a word that is no object, none at all, or no video core each take nothing up (no source set, the box hidden)',
            bad.every(b => b[0] === false && b[1] === null && b[2] === 'none' && b[3] === '') && r5 === false && P5.el.getAttribute('src') === null, j(bad));
        check('stream window (source): the GM\'s window posts at a showing\'s start and stop, on play, pause and seek while live, once a second while live and when a stream window asks; the stream window listens only in stream mode, asks on load, follows the stream sound setting, and the page holds the overlay; Help, the tour and the setting say so',
            /live = \{ id: v\.id, cap: cap \};\n\s*renderTable\(true\);\n\s*streamPost\(\); streamTicking\(true\);/.test(vjs) && /stopTracks\(l\.cap\);\n\s*renderTable\(true\);\n\s*streamTicking\(false\); streamPost\(\);/.test(vjs)
            && /\['play', 'pause', 'seeked'\]\.forEach\(function\(k\) \{ el\.addEventListener\(k, function\(\) \{ if \(live\) streamPost\(\); \}\); \}\);/.test(vjs) && /if \(e\.data && e\.data\.type === 'video-stage-query'\) streamPost\(\);/.test(vjs) && /_streamTick = setInterval\(streamPost, 1000\);/.test(vjs)
            && /if \(d && d\.type === 'video-stage'\) streamVideoApply\(d, svEl, svBox, svCap, window\.wpVideoCore, svSoundOn\(\)\);/.test(sj) && /svChan\.postMessage\(\{ type: 'video-stage-query' \}\);/.test(sj) && /if \(e\.key === 'wp_streamSound'\) svEl\.muted = !svSoundOn\(\);/.test(sj)
            && /<div id="streamVideo" style="display:none;"><video id="streamVideoEl" playsinline muted><\/video><div id="streamVideoCap"><\/div><\/div>/.test(ix) && /The <b>stream window<\/b> shows a video you are showing to players too, over its map, keeping to your position/.test(ix)
            && /Stream window plays the table's sound \(the ambient loop, a video shown to players\)/.test(ix) && /#streamVideo \{ position: fixed; inset: 0; z-index: 99990;/.test(read('system/app/style.css'))
            && /\(function maybeShowWelcome\(\) \{\n\s*if \(\/\[\?&\]stream=1\/\.test\(location\.search\)\) return;/.test(read('system/app/scripts/main.js')) && /body\.stream-mode \[id\$="Modal"\], body\.stream-mode #welcomeScreen \{ display: none !important; \}/.test(read('system/app/style.css')));   // and the welcome screen never over the stream window's map
    }
    // R2 #14 (the owner's ruling of 2026-10-01: the stream window is "a combined view of the players ... from a 3rd party perspective"): its "Focus on" menu
    // names the players' characters alone — stream.js ownKey / refreshCharSelect sliced by the streamchar markers and run on a recording menu with the real
    // characterList (models.js) and esc (safecore.js); a focus kept from before that names no player's character is forgotten; and the words the GM reads
    {
        const sj2 = read('system/app/scripts/stream.js');
        let cl = null, mErr = '';
        try {
            const mj = read('system/app/scripts/models.js'), a = mj.indexOf('export function characterList('), b = mj.indexOf(NL + '}' + NL, a);
            const SC = await import(url('safecore.js'));
            const charList = new Function(mj.slice(a + 'export '.length, b + 2) + NL + 'return characterList;')();
            const slice = sliceOf(sj2, 'streamchar');
            const mkMenu = (focus, where) => { const charSel = { dataset: {}, innerHTML: '' }, sel = { disabled: false, title: '' }; const api = new Function('charSel', 'charFocus', 'sel', 'esc', 'characterList', 'whoOf', slice + NL + 'return { refresh: refreshCharSelect, ownKey: ownKey };')(charSel, focus || '', sel, SC.esc, charList, () => pid => (where && Object.prototype.hasOwnProperty.call(where, pid) ? { map: where[pid], char: null } : null)); return { charSel, sel, api }; };
            const camp = { items: { m1: { id: 'm1', type: 'map', meta: { title: 'Cellar <b>' }, whiteboard: [{ id: 'tA', isChar: true, ownerId: 'u_a', charName: 'Ana & Co', x: 0, y: 0 }, { id: 'npc', isChar: true, charName: 'Lurker <img src=x>', x: 0, y: 0 }, { id: 'hid', isChar: true, ownerId: 'u_b', charName: 'Hidden Bo', hidden: true, x: 0, y: 0 }, { id: 'wt', waiting: 1, ownerId: 'u_c', charName: 'Waiting', x: 0, y: 0 }] },
                m2: { id: 'm2', type: 'map', meta: { title: 'Hall' }, whiteboard: [{ id: 'tB', isChar: true, ownerId: 'u_b', charName: 'Bo', x: 0, y: 0 }, { id: 'npc2', isChar: true, charName: 'Ogre', x: 0, y: 0 }] } } };
            const M1 = mkMenu('o:u_b'); M1.api.refresh(camp);
            cl = { html: M1.charSel.innerHTML, disabled: M1.sel.disabled, leak: /Lurker|Ogre|Hidden|img|Waiting/.test(M1.charSel.innerHTML + M1.charSel.dataset.sig), own: ['o:u_a', 'i:npc', 'i:tA', 'o:', '', null, 7, 'x:u_a'].map(M1.api.ownKey) };
            const M2 = mkMenu(''); M2.api.refresh(camp); cl.none = { html: M2.charSel.innerHTML, disabled: M2.sel.disabled };
            const camp2 = JSON.parse(JSON.stringify(camp)); camp2.items.m2.whiteboard.push({ id: 'tA2', isChar: true, ownerId: 'u_a', charName: 'Ana & Co', x: 0, y: 0 });   // a player with a token on two maps
            const M3 = mkMenu('', { u_a: 'm2' }); M3.api.refresh(camp2); const M4 = mkMenu(''); M4.api.refresh(camp2); cl.where = [M3.charSel.innerHTML, M4.charSel.innerHTML];
        } catch (e) { mErr = e.message; }
        check('R2 #14 the stream window\'s Focus on menu (run for real): one entry per player, named as text with the map\'s title — never an NPC (the Lurker, the Ogre), a hidden token or a waiting one; the map menu is held while a character is focused; a focus kept from before counts only as a player\'s (o: and a name), anything else is no one; a player with a token on two maps is named with the map that player is on, and with the first one found where nobody can say',
            !mErr && !!cl && cl.html === '<option value="">\u2014 no one \u2014</option><option value="o:u_a">Ana  Co (Cellar b)</option><option value="o:u_b" selected>Bo (Hall)</option>' && cl.disabled === true && cl.leak === false && j(cl.own) === j(['o:u_a', '', '', '', '', '', '', ''])
            && cl.none.html === '<option value="">\u2014 no one \u2014</option><option value="o:u_a">Ana  Co (Cellar b)</option><option value="o:u_b">Bo (Hall)</option>' && cl.none.disabled === false
            && cl.where[0] === cl.none.html.replace('Ana  Co (Cellar b)', 'Ana  Co (Hall)') && cl.where[1] === cl.none.html, mErr || j(cl));
        check('R2 #14 wired and said: the stream window reads the players\' characters alone (characterList owned-only), a kept focus and a pick pass through ownKey, a focus is located only as a player\'s and on the map that player is on (the GM\'s own save says where each was last seen, read before the party view is made); the header\'s live dot, the Settings button, its line and Help all say the window shows the party view — what the players\' tokens see together, never the GM\'s whole map — and no longer "exactly as players see it"',
            sj2.includes('var list = characterList(camp, true, null, whoOf(camp));') && /charFocus = ownKey\(localStorage\.getItem\('wp_streamChar'\)\);/.test(sj2) && /function setCharFocus\(key\) \{ charFocus = ownKey\(key\);/.test(sj2) && sj2.includes("var loc = charFocus && charFocus.charAt(0) === 'o' ? (window.wpCharNow ? window.wpCharNow(camp, charFocus).loc : locateCharacter(camp, charFocus)) : null;") && sj2.includes("net.streamWhere = seenBy[campId] || Object.create(null);") && sj2.includes("var seenBy = Object.create(null); Object.keys(data.campaigns).forEach(function(id) { seenBy[id] = lastSeen(data.campaigns[id]); });")
            && !/exactly as players see it|as players see it|It shows what players see|mirrors your table as players see it/.test(ix)
            && ix.includes('<span class="stream-dot" title="Live: this window mirrors your table from the party\'s standpoint &mdash; what the players\' tokens see together"></span>')
            && ix.includes('title="Opens a second window with only the play map, from the party\'s standpoint: on a fogged map it shows what the players\' tokens see together &mdash; every player\'s token, a creature none of them sees left out, the unexplored map covered &mdash; never your whole map and never one player\'s own view; GM notes are left out and hidden pieces stay hidden. Share that window in Discord, OBS or any screen-share for someone watching without the app. It follows the map you are on unless you pick a map, or one of the players\' characters, to focus in its corner menu.">&#128250; Open Stream Window</button>')
            && ix.includes('For a spectator without Waypoint: screen-share the stream window. It shows the party view &mdash; what the players\' tokens see together, never your whole map &mdash; and updates as you play.</div>')
            && ix.includes('<li><b>Stream window:</b> Settings &#9654; Open Stream Window gives you a second window with only the play map, from the party\'s standpoint. On a fogged map it draws the fog as what the players\' own tokens see together, shows every player\'s token and leaves out every creature none of them sees &mdash; never any one player\'s own view and never your whole map; GM notes and hidden pieces are left out everywhere. Screen-share it for someone watching without the app; its corner menu follows your map, focuses one map, or focuses one of the players\' characters (switching maps with them and staying centred at 150%).</li>'));
    }
    const tourStep = tu.slice(tu.indexOf("{ target: '#videoBtn', title: 'Video',"), tu.indexOf("{ target: '#whiteboardWrap', title: 'Ping',"));
    check('said: Help tells of the Video panel (add, any size, refused when it cannot play, rename, watch, delete, move, resize, full screen, on by default) and every feature list names video; the tour has a Video step after Visual effects and names it among the features; the release notes (both copies alike) and the integration guide say what a save holds',
        /<li><b>&#127902; Video<\/b> \(GM only, under &#127916; <b>Scene<\/b>\) opens the campaign&rsquo;s <b>videos<\/b> in a panel: <b>Add videos&hellip;<\/b> takes MP4 \(H\.264\) or WebM files from your computer, of any size/.test(ix) && /press <b>&#x26F6;<\/b> for full screen\. While you <b>host<\/b>, a video on the panel&rsquo;s stage has a row under it: <b>Show to players<\/b> sends it <b>live<\/b> to <b>Everyone<\/b> or to the players you tick/.test(ix)
        && /It closes on their screens when it ends, when you press <b>Stop showing<\/b>, when you pick another video or close the panel; tick <b>Loop<\/b> to keep a mood clip running/.test(ix) && /The row names who is being sent it and who it is still waiting for/.test(ix) && /closing it silences it, and a <b>&#127902;<\/b> chip in the header reopens it while it plays\. A player who joins late is shown it too\./.test(ix)
        && /Nothing is downloaded: the picture goes straight from your machine to each player, one stream a viewer \(at most 1280 wide\)/.test(ix) && /Video is a VTT feature \(&#9881; Settings &#9656; VTT features, on by default\); a player may switch it off for themselves\.<\/li>/.test(ix)
        && ix.includes('a video shown to a relayed player is by far the largest cost (some tens of megabytes a viewer for a ten-minute clip), then the images sent to them.') && ix.includes('While you host, show one live to everyone or to chosen players; a player may switch Video off for themselves.</div>')
        && /While you host, <b>Show to players<\/b> sends it live to everyone or to the players you tick\./.test(tourStep)
        && wn.includes('- Show a video to your players, live: while you host, a video on the\n  panel\'s stage has Show to players, for everyone or the players you tick.') && wn.includes('mood clip running. Nothing is downloaded, a player who joins late is\n  shown it too, and the panel names who is being sent it.')
        && ix.includes('fog of war, lighting, turn-based combat, the calendar and video (every one on for a new campaign until you switch it off)') && ix.includes('the calendar, video, and the VTT integration master') && ix.includes('the calendar and video. <b>&#9881; Settings') && ix.includes('button (sound, music, visual effects, video).')
        && tourStep.length > 300 && tu.indexOf("{ target: '#videoBtn'") > tu.indexOf("{ target: '#fxBtn'") && /window\.wpVideo\.close\(\)/.test(tourStep)
        && wn.indexOf('\nVideo\n- Video is a new VTT feature (Settings ▸ VTT features, on by default)') > 0 && wn.slice(wn.indexOf('\nVideo\n'), wn.indexOf('\nDice\n')) === wa.slice(wa.indexOf('\nVideo\n'), wa.indexOf('\nDice\n'))
        && /"videos": \[\{ "id": "v_ab12cd34", "name": "The docks at night", "path": "\/saves\/images\/video\/camp_x\/k3j9a0pq_docks\.mp4", "size": 48213401, "dur": 94\.5, "w": 1920, "h": 1080 \}\],   \/\/ OPTIONAL, app-managed \(1\.5\.0, the Video feature\): the GM's video library, never sent to players/.test(ci)
        && /A campaign export carries the files themselves under images\/video\/<campaign>\/ in its zip \(any size: an archive past 4 GB or 65,535 entries is ZIP64\), and an import copies each back only after its CRC-32 matches; on a merge the library joins the one already there by "id"\./.test(ci) && V.cleanVideos([{ id: 'v_ab12cd34', name: 'The docks at night', path: '/saves/images/video/camp_x/k3j9a0pq_docks.mp4', size: 48213401, dur: 94.5, w: 1920, h: 1080 }]).length === 1);

    summed = true;
    console.log(NL + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})().catch(function(e) { console.log('FAIL      the suite threw: ' + (e && e.stack || e)); process.exit(1); });
