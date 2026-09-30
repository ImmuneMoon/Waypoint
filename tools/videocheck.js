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

    /* ---- the name a file is uploaded under, and the local server taking it ---- */
    const main = read('system/resources/app/main.js'), grab = re => (re.exec(main) || [''])[0];
    const serverName = new Function(grab(/const FILE_EXT_BAD = [^\n]*/) + NL + grab(/function safeSeg\(s\) [^\n]*/) + NL + grab(/function safeFileName\(n\) [^\n]*/) + NL + 'return safeFileName;')();
    const names = ['My Clip (final).MP4', 'a/b\\c?d#e%f.webm', '..\\..\\evil.mp4', '.hidden.mov', 'con:*"<>|.m4v', 'tab\there.ogv', 'Überfahrt nach Hause.mp4', '😀'.repeat(120) + '.mp4', 'x'.repeat(300) + '.webm', '...mp4', ' spaced .mp4 ', 'a..b...c.mp4'];
    const disk = names.map(V.diskName);
    check('the name a video is uploaded under: its own name with separators, ?, #, %, spaces, control characters and a walk as _, no leading dot, cut to 80 code points, its extension in lower case; a file that is not a video by name gets none',
        j(disk.slice(0, 4)) === j(['My_Clip_(final).mp4', 'a_b_c_d_e_f.webm', 'evil.mp4', 'hidden.mov']) && disk[5] === 'tab_here.ogv' && disk[6] === 'Überfahrt_nach_Hause.mp4' && Array.from(disk[7]).length === 84 && disk[8] === 'x'.repeat(80) + '.webm' && disk[9] === 'video.mp4' && disk[10] === 'spaced_.mp4' && disk[11] === 'a_b_c.mp4'
        && ['x.mkv', 'x.mp4.exe', 'x.html', 'mp4', '', null, 5].every(n => V.diskName(n) === ''), j(disk));
    check('every name it gives is one the local server takes (the shell\'s own safeFileName, sliced from main.js) and, behind the server\'s prefix, an uploaded video\'s path',
        typeof serverName === 'function' && disk.every(n => serverName(n) && V.isVideoPath('/saves/images/video/camp_1/k3j9a0pq_' + n)) && !serverName('x.html') && !serverName('.x.mp4'), j(disk.filter(n => !serverName(n) || !V.isVideoPath('/saves/images/video/camp_1/k3j9a0pq_' + n))));
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
        /stage\.requestFullscreen\(\)\.then\(function\(\) \{ settled = true; \}, function\(\) \{ settled = true; setMax\(true\); \}\);/.test(vjs) && /setTimeout\(function\(\) \{ if \(!settled && !document\.fullscreenElement && showing\) setMax\(true\); \}, 1200\);/.test(vjs)
        && /if \(p\.classList\.contains\('vid-max'\)\) \{ setMax\(false\); return; \}/.test(vjs) && /if \(p\.classList\.contains\('vid-max'\)\) \{ e\.stopPropagation\(\); setMax\(false\); return; \}/.test(vjs) && /setMax\(false\);\n\}/.test(vjs)
        && /if \(e\.target\.closest\('button'\) \|\| p\.classList\.contains\('vid-max'\)\) return;/.test(vjs)
        && /#videoPanel\.vid-max \{ left: 0 !important; top: 0 !important; right: auto; width: 100vw !important; height: 100vh !important;/.test(read('system/app/style.css')) && /#videoPanel\.vid-max #videoBody, #videoPanel\.vid-max \.video-resize, #videoPanel\.vid-max \.video-caption \{ display: none; \}/.test(read('system/app/style.css')));

    /* ---- wired into the page, the features, the render and the documents ---- */
    const ix = read('system/app/index.html'), vt = read('system/app/scripts/vtt.js'), mn = read('system/app/scripts/main.js'), tu = read('system/app/scripts/tutorial.js'), ci = read('CAMPAIGN_INTEGRATION.md'), wn = read('WHATSNEW.txt'), wa = read('system/app/assets/whatsnew.txt'), st = read('system/app/scripts/settings.js');
    const scene = ix.slice(ix.indexOf('<div class="shape-menu" id="sceneFxMenu"'), ix.indexOf('</div>', ix.indexOf('<div class="shape-menu" id="sceneFxMenu"')));
    check('the page: videocore loads before the app\'s main module (the load cleans with it), video.js after Music; the Video button in the Scene menu; the panel with its head, full screen and close, the stage and its video, the body, the file picker for video files and the corner',
        ix.indexOf('src="scripts/videocore.js"') > 0 && ix.indexOf('src="scripts/videocore.js"') < ix.indexOf('src="scripts/main.js"') && ix.indexOf('src="scripts/video.js"') > ix.indexOf('src="scripts/music.js"')
        && /id="videoBtn"/.test(scene) && ['videoPanel', 'videoHead', 'videoFullBtn', 'videoCloseBtn', 'videoStage', 'videoEl', 'videoCaption', 'videoBody', 'videoResize'].every(id => ix.indexOf('id="' + id + '"') > 0)
        && ix.includes('<input type="file" id="videoFile" accept=".mp4,.m4v,.webm,.ogv,.mov,video/*" multiple style="display:none;">') && ix.includes('<video id="videoEl" controls playsinline preload="metadata"></video>'));
    check('the feature: Video last in the list, on by default, a player\'s own switch; its Settings row and its default row; its words when switched; the app\'s render keeps the panel in step after the clock',
        /\{ id: 'video',     label: 'Video',            legacyKey: null \}/.test(vt) && ix.includes('<div class="set-vtt-row" data-vtt="video"') && ix.includes('id="setVideoBtn"') && ix.includes('id="setVideoState"') && ix.includes('id="setVttGlobalVideoBtn"') && ix.includes('id="setVttGlobalVideoState"')
        && /    video: \['Video on/.test(st) && /window\.wpCalendar\.refresh\(\);[^\n]*\n      if \(window\.wpVideo && window\.wpVideo\.refresh\) window\.wpVideo\.refresh\(\);/.test(mn));
    const tourStep = tu.slice(tu.indexOf("{ target: '#videoBtn', title: 'Video',"), tu.indexOf("{ target: '#whiteboardWrap', title: 'Ping',"));
    check('said: Help tells of the Video panel (add, any size, refused when it cannot play, rename, watch, delete, move, resize, full screen, on by default) and every feature list names video; the tour has a Video step after Visual effects and names it among the features; the release notes (both copies alike) and the integration guide say what a save holds',
        /<li><b>&#127902; Video<\/b> \(GM only, under &#127916; <b>Scene<\/b>\) opens the campaign&rsquo;s <b>videos<\/b> in a panel: <b>Add videos&hellip;<\/b> takes MP4 \(H\.264\) or WebM files from your computer, of any size/.test(ix) && /press <b>&#x26F6;<\/b> for full screen\. Video is a VTT feature \(&#9881; Settings &#9656; VTT features, on by default\)\.<\/li>/.test(ix)
        && ix.includes('fog of war, lighting, turn-based combat, the calendar and video (every one on for a new campaign until you switch it off)') && ix.includes('the calendar, video, and the VTT integration master') && ix.includes('the calendar and video. <b>&#9881; Settings') && ix.includes('button (sound, music, visual effects, video).')
        && tourStep.length > 300 && tu.indexOf("{ target: '#videoBtn'") > tu.indexOf("{ target: '#fxBtn'") && /goes <b>full screen<\/b>/.test(tourStep) && /window\.wpVideo\.close\(\)/.test(tourStep) && tu.includes('<b>Turn-based combat</b>, the <b>Calendar</b> and <b>Video</b>')
        && wn.indexOf('\nVideo\n- Video is a new VTT feature (Settings ▸ VTT features, on by default)') > 0 && wn.slice(wn.indexOf('\nVideo\n'), wn.indexOf('\nDice\n')) === wa.slice(wa.indexOf('\nVideo\n'), wa.indexOf('\nDice\n'))
        && /"videos": \[\{ "id": "v_ab12cd34", "name": "The docks at night", "path": "\/saves\/images\/video\/camp_x\/k3j9a0pq_docks\.mp4", "size": 48213401, "dur": 94\.5, "w": 1920, "h": 1080 \}\],   \/\/ OPTIONAL, app-managed \(1\.5\.0, the Video feature\): the GM's video library, never sent to players/.test(ci)
        && /The files themselves are not in a campaign export\./.test(ci) && V.cleanVideos([{ id: 'v_ab12cd34', name: 'The docks at night', path: '/saves/images/video/camp_x/k3j9a0pq_docks.mp4', size: 48213401, dur: 94.5, w: 1920, h: 1080 }]).length === 1);

    summed = true;
    console.log(NL + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})().catch(function(e) { console.log('FAIL      the suite threw: ' + (e && e.stack || e)); process.exit(1); });
