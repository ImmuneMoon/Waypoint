/* Offline check of the local server's library storage (system/resources/app/libstore.js, Stage 6 library L1b), run for real: the
   store behind a Node HTTP server on a scratch folder in the OS temp directory (removed at the end) — names checked before any
   path is made, nothing outside saves/library, the 16 MB cap while streaming, UTF-8 across chunk boundaries, one file per
   revision with the newest five kept, delete, and the library snapshot every backup of the save takes and gives back. Then the
   file serving both servers share (system/resources/app/servefile.js, item 21 V1), run for real the same way: a media file's own
   type, its length, a byte range (206), one outside the file (416), HEAD, a missing file, a read that fails. Then a source check
   that the shell (main.js) and the dev server wire both the same way. Then what the local server takes and refuses
   (system/resources/app/reqguard.js, the outside audit of 2026-10-01): its rules run for real, the dev server as a child process on
   scratch saves, and the shell's own request handling (main.js, sliced, Electron's parts as recording stubs) on a scratch folder. Then the shell's windows (system/resources/app/shellguard.js):
   its rules run as plain functions, and main.js itself run over a recording stand-in for the electron module
   (tools/electronstub.js, a child process — Node alone, a scratch folder, loopback only; no Electron is ever started).
   Usage: node tools/servercheck.js   (exit 1 on any failure) */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const NL = String.fromCharCode(10);
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok       ', name); } else { fail++; console.log('FAIL     ', name, detail !== undefined ? '-> ' + String(detail).slice(0, 300) : ''); } }
const j = v => JSON.stringify(v);
const lib = require('../system/resources/app/libstore.js');
const sf = require('../system/resources/app/servefile.js');

let summed = false;   // a check that never settles (a promise nothing answers) would let Node exit with no summary and code 0: that is a failure
process.on('exit', code => { if (!summed && !code) { console.log('\nFAIL      the asynchronous checks never finished (a promise was left waiting)'); process.exitCode = 1; } });
(async () => {
    const saves = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-servercheck-')), bk = path.join(saves, 'backups');
    const server = http.createServer((req, res) => { const url = new URL(req.url, 'http://localhost'); if (url.pathname === '/api/library') return lib.handle(req, res, url, saves); res.writeHead(404); res.end(); });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    server.unref();   // a listening server alone never keeps Node alive: a stalled check lets the loop empty, so the exit guard reports it
    const port = server.address().port;
    // method, query, body (a string, or an array of Buffers sent as separate chunks)
    const call = (method, query, body) => new Promise(resolve => {
        const req = http.request({ host: '127.0.0.1', port, method, path: '/api/library?' + query, agent: false }, res => { const bufs = []; res.on('data', b => bufs.push(b)); res.on('end', () => resolve({ code: res.statusCode, text: Buffer.concat(bufs).toString('utf8') })); });
        req.on('error', e => resolve({ code: 0, text: String(e && e.code) }));
        req.setTimeout(15000, () => { const e = new Error('no answer'); e.code = 'ETIMEDOUT'; req.destroy(e); });   // a request nothing answers fails its check instead of hanging the run
        if (Array.isArray(body)) { let i = 0; const next = () => { if (i < body.length) { req.write(body[i++]); setTimeout(next, 5); } else req.end(); }; next(); } else { if (body !== undefined) req.write(body); req.end(); }
    });
    const D = 'l_abcd1234', dirAbs = path.join(saves, 'library', D);
    const packText = (id, rev, extra) => JSON.stringify(Object.assign({ format: 'waypoint-pack', v: 1, id, rev, entries: [{ id: 'i_a', name: 'A' }] }, extra || {}));
    try {
        const bad = await Promise.all(['dir=../x', 'dir=' + encodeURIComponent('../l_abcd1234'), 'dir=%2e%2e', 'dir=l_ABCD1234', 'dir=camp_1', 'dir=', 'dir=' + D + '&pack=p_..%2Fx', 'dir=' + D + '&pack=x', 'dir=' + D + '&pack=p_a&rev=abc', 'dir=' + D + '&pack=p_a&rev=01', 'dir=' + D + '&pack=p_a&rev=1000000001', 'dir=' + D + '&pack=p_a&rev=-1'].map(q => call('GET', q)));
        check('a folder, pack or revision that is not a plain generated name (a path, an encoded dot-dot, upper case, a campaign id, a leading zero, a negative or huge revision) is refused before any path is made, and nothing is created',
            bad.every(r => r.code === 400 && /bad name/.test(r.text)) && !fs.existsSync(path.join(saves, 'library')), j(bad.map(r => r.code)));
        const empty = await call('GET', 'dir=' + D);
        check('a folder that holds nothing yet lists no packs', empty.code === 200 && empty.text === '{"packs":{}}', empty.text);
        const t1 = packText('p_gear', 1), p1 = await call('POST', 'dir=' + D + '&pack=p_gear&rev=1', t1);
        const g1 = await call('GET', 'dir=' + D + '&pack=p_gear'), g1r = await call('GET', 'dir=' + D + '&pack=p_gear&rev=1'), l1 = await call('GET', 'dir=' + D);
        check('a pack written is stored as <id>.<rev>.json in its folder and read back exactly as written (the newest, or by revision); the folder lists it',
            p1.code === 200 && JSON.parse(p1.text).file === 'p_gear.1.json' && fs.existsSync(path.join(dirAbs, 'p_gear.1.json')) && g1.text === t1 && g1r.text === t1 && l1.text === '{"packs":{"p_gear":[1]}}', j([p1, l1]));
        const wrong = await Promise.all([
            call('POST', 'dir=' + D + '&pack=p_gear&rev=2', packText('p_other', 2)), call('POST', 'dir=' + D + '&pack=p_gear&rev=2', packText('p_gear', 3)), call('POST', 'dir=' + D + '&pack=p_gear&rev=2', packText('p_gear', 2, { format: 'other' })),
            call('POST', 'dir=' + D + '&pack=p_gear&rev=2', packText('p_gear', 2, { entries: 'x' })), call('POST', 'dir=' + D + '&pack=p_gear&rev=2', '{not json'), call('POST', 'dir=' + D + '&pack=p_gear&rev=2', '[1]'), call('POST', 'dir=' + D + '&pack=p_gear', t1)]);
        check('a body that is not this pack (another id or revision, another format, no entries list, not JSON, an array) or a write with no revision is refused, and nothing is stored',
            wrong.slice(0, 6).every(r => r.code === 400) && wrong[6].code === 400 && !fs.existsSync(path.join(dirAbs, 'p_gear.2.json')), j(wrong.map(r => r.code)));
        const big = '{"format":"waypoint-pack","v":1,"id":"p_big","rev":1,"entries":[],"pad":"' + 'x'.repeat(lib.MAX_BYTES) + '"}', pBig = await call('POST', 'dir=' + D + '&pack=p_big&rev=1', big);
        check('a body over 16 MB is refused while it streams (413) and nothing is written', (pBig.code === 413 || pBig.code === 0) && !fs.existsSync(path.join(dirAbs, 'p_big.1.json')), pBig.code);
        const uni = packText('p_uni', 1, { note: 'a — b 😀 c' }), ub = Buffer.from(uni, 'utf8'), cut = ub.indexOf(Buffer.from('—', 'utf8')) + 1, cut2 = ub.indexOf(Buffer.from('😀', 'utf8')) + 2;
        const pU = await call('POST', 'dir=' + D + '&pack=p_uni&rev=1', [ub.slice(0, cut), ub.slice(cut, cut2), ub.slice(cut2)]);
        check('a pack whose em dash and emoji are split between network chunks is stored whole (UTF-8 decoded across chunks)',
            pU.code === 200 && fs.readFileSync(path.join(dirAbs, 'p_uni.1.json'), 'utf8') === uni && !/�/.test(fs.readFileSync(path.join(dirAbs, 'p_uni.1.json'), 'utf8')));
        for (let r = 2; r <= 8; r++) await call('POST', 'dir=' + D + '&pack=p_gear&rev=' + r, packText('p_gear', r));
        const l2 = JSON.parse((await call('GET', 'dir=' + D)).text), gOld = await call('GET', 'dir=' + D + '&pack=p_gear&rev=1'), gNew = await call('GET', 'dir=' + D + '&pack=p_gear');
        check('each revision is its own file and the newest five of a pack are kept (8 to 4); an older one is gone (404); the newest is what a read without a revision gets',
            j(l2.packs.p_gear) === j([8, 7, 6, 5, 4]) && gOld.code === 404 && JSON.parse(gNew.text).rev === 8 && lib.KEEP === 5, j(l2));
        fs.writeFileSync(path.join(dirAbs, 'notes.txt'), 'x'); fs.writeFileSync(path.join(dirAbs, 'p_gear.9.json.tmp'), 'x');
        const lX = JSON.parse((await call('GET', 'dir=' + D)).text);
        check('anything in the folder that is not a pack file (a text file, a half-written .tmp) is never listed or served', j(Object.keys(lX.packs).sort()) === j(['p_gear', 'p_uni']) && j(lX.packs.p_gear) === j([8, 7, 6, 5, 4]), j(lX));

        fs.mkdirSync(bk, { recursive: true });
        const nSnap = lib.snapshot(saves, bk, 'data-2026-09-26-12-00-00'), snapDir = path.join(bk, 'lib-data-2026-09-26-12-00-00', D);
        fs.unlinkSync(path.join(dirAbs, 'p_gear.8.json')); fs.writeFileSync(path.join(dirAbs, 'p_uni.1.json'), 'NEWER');
        const nBack = lib.restore(saves, bk, 'data-2026-09-26-12-00-00');
        check('a backup keeps the library\'s pack files as they were (backups/lib-<name>/<folder>/); restoring it brings back a file that went and leaves one already there alone',
            nSnap === 6 && fs.existsSync(path.join(snapDir, 'p_gear.8.json')) && !fs.existsSync(path.join(snapDir, 'notes.txt')) && nBack === 1 && JSON.parse(fs.readFileSync(path.join(dirAbs, 'p_gear.8.json'), 'utf8')).rev === 8 && fs.readFileSync(path.join(dirAbs, 'p_uni.1.json'), 'utf8') === 'NEWER', j([nSnap, nBack]));
        check('a snapshot name that is not a backup\'s (a path, anything else) makes and restores nothing; a dropped snapshot is gone',
            lib.snapshot(saves, bk, '../evil') === 0 && lib.snapshot(saves, bk, 'lib-x') === 0 && lib.restore(saves, bk, '../../x') === 0 && !fs.existsSync(path.join(saves, 'evil')) && (lib.dropSnapshot(bk, 'data-2026-09-26-12-00-00'), !fs.existsSync(path.join(bk, 'lib-data-2026-09-26-12-00-00'))));
        const dPack = await call('DELETE', 'dir=' + D + '&pack=p_uni'), lD = JSON.parse((await call('GET', 'dir=' + D)).text);
        fs.unlinkSync(path.join(dirAbs, 'notes.txt')); fs.unlinkSync(path.join(dirAbs, 'p_gear.9.json.tmp'));
        const dAll = await call('DELETE', 'dir=' + D), put = await call('PUT', 'dir=' + D + '&pack=p_a&rev=1', '{}');
        check('delete takes a pack\'s files, then the whole folder\'s (the folder itself once nothing else is in it); another method is refused',
            dPack.code === 200 && j(Object.keys(lD.packs)) === j(['p_gear']) && dAll.code === 200 && JSON.parse(dAll.text).removed === 1 && !fs.existsSync(dirAbs) && put.code === 405, j([dPack.text, dAll.text, put.code]));
    } finally {
        server.close();
        try { fs.rmSync(saves, { recursive: true, force: true }); } catch (e) {}
    }

    {   // item 21 V1: servefile — the pure parts first, then a Node HTTP server on a scratch folder answering with it
        const R = (h, n) => j(sf.parseRange(h, n));
        check('a Range header is read against the file\'s size: a span (its end cut to the file), from a byte to the end, the last n bytes (all of a short file)',
            R('bytes=0-9', 100) === j({ start: 0, end: 9 }) && R('bytes=90-', 100) === j({ start: 90, end: 99 }) && R('bytes=-10', 100) === j({ start: 90, end: 99 }) && R('bytes=-200', 100) === j({ start: 0, end: 99 })
            && R('bytes=10-500', 100) === j({ start: 10, end: 99 }) && R(' bytes=5-5 ', 100) === j({ start: 5, end: 5 }), j([R('bytes=0-9', 100), R('bytes=-10', 100), R('bytes=10-500', 100)]));
        check('a range with nothing of it inside the file (starting at or past its end, backwards, the last 0 bytes, any range of an empty file) is refused as such (416)',
            R('bytes=100-', 100) === '"bad"' && R('bytes=150-160', 100) === '"bad"' && R('bytes=5-2', 100) === '"bad"' && R('bytes=-0', 100) === '"bad"' && R('bytes=0-', 0) === '"bad"' && R('bytes=99999999999999999999-', 100) === '"bad"',
            j([R('bytes=100-', 100), R('bytes=5-2', 100), R('bytes=-0', 100), R('bytes=0-', 0)]));
        check('no header, several ranges, another unit, a bare dash, a negative or a word read as no range (the whole file)',
            [undefined, '', 'bytes=0-1,5-6', 'items=0-9', 'bytes=-', 'bytes=-5-9', 'bytes=a-b', 'bytes=0-9;x'].every(h => sf.parseRange(h, 100) === null) && sf.parseRange('bytes=0-9', -1) === null && sf.parseRange('bytes=0-9', '100') === null);
        check('a media file\'s type comes from its own extension, in any case, from the list alone (a page, a script or an inherited name has none)',
            sf.mediaType('.mp4') === 'video/mp4' && sf.mediaType('.MP4') === 'video/mp4' && sf.mediaType('.webm') === 'video/webm' && sf.mediaType('.mov') === 'video/quicktime' && sf.mediaType('.ogv') === 'video/ogg' && sf.mediaType('.m4v') === 'video/mp4'
            && sf.mediaType('.mp3') === 'audio/mpeg' && ['.html', '.js', '.svg', 'mp4', '', '__proto__', 'constructor', '.toString', null, 4].every(e => sf.mediaType(e) === null) && Object.isFrozen(sf.MEDIA));
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-servefile-')), body = Buffer.alloc(1000);
        for (let i = 0; i < body.length; i++) body[i] = i % 251;
        fs.writeFileSync(path.join(dir, 'clip.mp4'), body); fs.writeFileSync(path.join(dir, 'empty.webm'), ''); fs.mkdirSync(path.join(dir, 'sub'));
        const srv = http.createServer((req, res) => sf.serveFile(req, res, path.join(dir, decodeURIComponent(new URL(req.url, 'http://localhost').pathname.slice(1))), { 'Content-Type': 'video/mp4', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }));
        await new Promise(r => srv.listen(0, '127.0.0.1', r)); srv.unref();
        const get = (p, range, method) => new Promise(resolve => {
            const req = http.request({ host: '127.0.0.1', port: srv.address().port, method: method || 'GET', path: '/' + p, agent: false, headers: range ? { Range: range } : {} }, res => { const bufs = []; res.on('data', b => bufs.push(b)); res.on('end', () => resolve({ code: res.statusCode, h: res.headers, b: Buffer.concat(bufs) })); });
            req.on('error', e => resolve({ code: 0, h: {}, b: Buffer.alloc(0), e: String(e && e.code) }));
            req.setTimeout(15000, () => { const e = new Error('no answer'); e.code = 'ETIMEDOUT'; req.destroy(e); }); req.end();
        });
        try {
            const whole = await get('clip.mp4'), part = await get('clip.mp4', 'bytes=100-199'), tail = await get('clip.mp4', 'bytes=-50'), open = await get('clip.mp4', 'bytes=990-');
            check('the whole file answers 200 with the caller\'s headers, its length and Accept-Ranges, byte for byte',
                whole.code === 200 && whole.h['content-type'] === 'video/mp4' && whole.h['cache-control'] === 'no-store' && whole.h['x-content-type-options'] === 'nosniff' && whole.h['accept-ranges'] === 'bytes' && whole.h['content-length'] === '1000' && whole.b.equals(body), j([whole.code, whole.h]));
            check('a range answers 206 with that part alone, its Content-Range and its length (a span, the last bytes, from a byte to the end), the caller\'s headers kept',
                part.code === 206 && part.h['content-range'] === 'bytes 100-199/1000' && part.h['content-length'] === '100' && part.b.equals(body.slice(100, 200)) && part.h['content-type'] === 'video/mp4'
                && tail.code === 206 && tail.h['content-range'] === 'bytes 950-999/1000' && tail.b.equals(body.slice(950)) && open.code === 206 && open.h['content-range'] === 'bytes 990-999/1000' && open.b.equals(body.slice(990)), j([part.code, part.h, tail.h, open.h]));
            const past = await get('clip.mp4', 'bytes=1000-'), emp = await get('empty.webm', 'bytes=0-'), emp0 = await get('empty.webm'), multi = await get('clip.mp4', 'bytes=0-1,5-6');
            check('a range outside the file answers 416 with the file\'s size and no body; an empty file whole is 200 with length 0; several ranges get the whole file',
                past.code === 416 && past.h['content-range'] === 'bytes */1000' && past.b.length === 0 && emp.code === 416 && emp.h['content-range'] === 'bytes */0' && emp0.code === 200 && emp0.h['content-length'] === '0'
                && multi.code === 200 && multi.b.equals(body), j([past.code, past.h['content-range'], emp.code, emp0.code, multi.code]));
            const head = await get('clip.mp4', null, 'HEAD'), headR = await get('clip.mp4', 'bytes=0-9', 'HEAD'), miss = await get('nope.mp4'), sub = await get('sub'), missR = await get('nope.mp4', 'bytes=0-9');
            check('HEAD answers the headers alone (the length, a range\'s too); a file that is not there or is a folder answers 404 with or without a range',
                head.code === 200 && head.h['content-length'] === '1000' && head.b.length === 0 && headR.code === 206 && headR.h['content-range'] === 'bytes 0-9/1000' && headR.b.length === 0
                && miss.code === 404 && sub.code === 404 && missR.code === 404 && !miss.h['content-range'], j([head.code, headR.code, miss.code, sub.code]));
            const Wr = require('stream').Writable, w = new Wr({ write(c, e, cb) { cb(); } });
            w.writeHead = code => { w.code = code; }; fs.writeFileSync(path.join(dir, 'gone.mp4'), body);
            sf.serveFile({ method: 'GET', headers: {} }, w, path.join(dir, 'gone.mp4'), {}); fs.unlinkSync(path.join(dir, 'gone.mp4'));   // found, then gone before it is opened
            await new Promise(r => setTimeout(r, 100));
            check('a file that goes before it is read ends the response (never a hang, never an uncaught error)', w.code === 200 && w.destroyed === true, j([w.code, w.destroyed]));
            const hw = new Wr({ write(c, e, cb) { hw.got = (hw.got || 0) + c.length; cb(); } }); hw.writeHead = (code, h) => { hw.code = code; hw.h = h; };
            sf.serveFile({ method: 'HEAD', headers: { range: 'bytes=0-9' } }, hw, path.join(dir, 'clip.mp4'), {}); await new Promise(r => setTimeout(r, 50));
            check('HEAD never opens the file: the headers go and the answer ends with no byte of it read or written', hw.code === 206 && hw.h['Content-Length'] === 10 && !hw.got && hw.writableEnded === true, j([hw.code, hw.got, hw.writableEnded]));
        } finally {
            srv.close();
            try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
        }
    }

    const main = fs.readFileSync(path.join(__dirname, '..', 'system', 'resources', 'app', 'main.js'), 'utf8').replace(/\r\n/g, '\n'), dev = fs.readFileSync(path.join(__dirname, 'dev-server.js'), 'utf8').replace(/\r\n/g, '\n');
    const route = "    if (url.pathname === '/api/library') { libstore.handle(req, res, url, savesDir); return; }", both = s => s.indexOf(route) > 0 && s.indexOf(route) < s.indexOf("if (url.pathname === '/api/data') {") && s.indexOf(route) < s.indexOf('try { pathname = decodeURIComponent(url.pathname); }')
        && /libstore\.snapshot\(savesDir, bkDir, f\.replace\(\/\\\.json\$\/, ''\)\);/.test(s) && /reqguard\.removeBackup\(bkDir, file, libstore\);/.test(s)
        && /libstore\.restore\(savesDir, bkDir, file\.replace\(\/\\\.json\$\/, ''\)\);/.test(s) && /libstore\.snapshot\(savesDir, bkDir, bf\);/.test(s);
    check('the shell and the dev server route /api/library to the one store (behind their own local gate, before the save and the static files), a pack is written to a .tmp and renamed (a crash never leaves half a pack), and every backup, backup-now, restore and delete takes the library with the save; the shell\'s launch backup too, and pruning a launch backup drops its snapshot',
        both(main) && both(dev) && /const file = path\.join\(d, pack \+ '\.' \+ rev \+ '\.json'\), tmp = file \+ '\.tmp';\n\s*fs\.writeFileSync\(tmp, body, 'utf8'\); fs\.renameSync\(tmp, file\);/.test(fs.readFileSync(path.join(__dirname, '..', 'system', 'resources', 'app', 'libstore.js'), 'utf8').replace(/\r\n/g, '\n')) && /require\('\.\/libstore'\)/.test(main) && /require\('\.\.\/system\/resources\/app\/libstore'\)/.test(dev)
        && /libstore\.snapshot\(savesDir, bkDir, 'data-' \+ stamp\);/.test(main) && /old\.forEach\(f => \{ fs\.unlinkSync\(path\.join\(bkDir, f\)\); libstore\.dropSnapshot\(bkDir, f\.replace\(\/\\\.json\$\/, ''\)\); \}\);/.test(main));

    const staticM = /if \(pathname\.startsWith\('\/saves\/'\)\) mime = shellguard\.savesType\(mime\);[^\n]*\n\s*mime = servefile\.mediaType\(ext\) \|\| mime;[^\n]*\n\s*servefile\.serveFile\(req, res, filePath, \{[^\n]*\n\s*'Content-Type': mime,\n\s*\.\.\.\(pathname\.startsWith\('\/saves\/'\) \? \{ 'Content-Security-Policy': 'sandbox', 'X-Content-Type-Options': 'nosniff' \} : shellguard\.pageHeaders\(mime, path\.join\(savesDir, 'preferences\.json'\)\)\),[^\n]*\n\s*'Cache-Control': 'no-cache, no-store, must-revalidate'\n\s*\}\);/;
    const staticD = /const underSaves = pathname\.startsWith\('\/saves\/'\), mime = servefile\.mediaType\(ext\) \|\| \(underSaves \? shellguard\.savesType\(mimes\[ext\] \|\| 'text\/plain'\) : mimes\[ext\] \|\| 'text\/plain'\);[^\n]*\n\s*servefile\.serveFile\(req, res, filePath, Object\.assign\(\{ 'Content-Type': mime, 'Cache-Control': 'no-cache, no-store, must-revalidate' \}, underSaves \? \{ 'Content-Security-Policy': 'sandbox', 'X-Content-Type-Options': 'nosniff' \} : shellguard\.pageHeaders\(mime, path\.join\(savesDir, 'preferences\.json'\)\)\)\);/;
    check('the shell and the dev server serve every static file through servefile (a media file by its own type, its length, a byte range), a file under saves/ still sandboxed and nosniff, none read whole by hand any more',
        /const servefile = require\('\.\/servefile'\);/.test(main) && /const servefile = require\('\.\.\/system\/resources\/app\/servefile'\);/.test(dev) && staticM.test(main) && staticD.test(dev)
        && !/createReadStream\(filePath\)\.pipe\(res\)/.test(main) && !/createReadStream\(filePath\)\.pipe\(res\)/.test(dev));
    {   // cluster P of the outside audit: the page's policy has one text and one judge of the mode
        const sgP = (() => { try { return fs.readFileSync(path.join(__dirname, '..', 'system', 'resources', 'app', 'shellguard.js'), 'utf8').replace(/\r\n/g, '\n'); } catch (e) { return ''; } })();
        const one = (s, re) => (s.match(re) || []).length === 1, noText = s => !/script-src|default-src|connect-src|unsafe-eval|unsafe-inline|frame-ancestors/.test(s);
        const peerLib = (() => { try { return fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'assets', 'vendor', 'peerjs.min.js'), 'utf8'); } catch (e) { return ''; } })();
        const netP = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n'), relayP = netP.slice(netP.indexOf('// [netcheck:relay-start]'), netP.indexOf('// [netcheck:relay-end]'));
        let sgM = null; try { sgM = require('../system/resources/app/shellguard.js'); } catch (e) { sgM = null; }
        check('the page\'s policy, pinned: the shell and the dev server each send an app file\'s headers through shellguard.pageHeaders, with the settings file the windows\' own rules read, and the type of a file under saves/ through shellguard.savesType; neither holds a word of policy text, a second policy header or a reader of the settings file for it; the policy\'s text is made in one function and its mode read by the one function that reads Developer mode (shellguard.devModeOf, the module\'s only file read)',
            staticM.test(main) && staticD.test(dev) && one(main, /Content-Security-Policy/g) && one(dev, /Content-Security-Policy/g) && noText(main) && noText(dev) && one(main, /shellguard\.pageHeaders\(/g) && one(dev, /shellguard\.pageHeaders\(/g) && one(main, /shellguard\.savesType\(/g) && one(dev, /shellguard\.savesType\(/g)
            && one(sgP, /function pagePolicy\(dev\) \{/g) && one(sgP, /h\['Content-Security-Policy'\] = pagePolicy\(devModeOf\(prefsFile\)\);/g) && one(sgP, /Content-Security-Policy/g) && one(sgP, /readFileSync/g) && one(sgP, /"script-src 'self'" \+ \(dev === true \? " 'unsafe-eval'" : ''\),/g)
            && /prefsFile: path\.join\(savesDir, 'preferences\.json'\)/.test(main) && !/devModeOf/.test(main) && !/devModeOf/.test(dev));
        check('the policy\'s one outside address is the one the connection library dials: the bundled PeerJS names 0.peerjs.com on port 443 as its server, the app hands it no other (both new Peer calls pass peerOpts(), which sets only the ICE config: no host, port, path, key or secure of its own), and shellguard names the same host — a signalling server of the app\'s own would have to be added to the policy here first',
            !!sgM && sgM.SIGNAL_HOST === '0.peerjs.com' && /this\.CLOUD_HOST="0\.peerjs\.com",this\.CLOUD_PORT=443/.test(peerLib) && (netP.match(/new Peer\(/g) || []).length === 2 && /var peer = new Peer\(roomPeerId\(code, gen\), peerOpts\(\)\);/.test(netP) && /var peer = new Peer\(peerOpts\(\)\);/.test(netP)
            && relayP.length > 200 && /function peerOpts\(\) \{\n\s*var t = turnConfig\(\);\n\s*if \(relayOnly\(\) && t\) return \{ config: \{ iceServers: \[t\], iceTransportPolicy: 'relay' \} \};[^\n]*\n\s*return \{ config: \{ iceServers: iceServers\(\) \} \};[^\n]*\n\}/.test(relayP) && !/\b(host|port|path|key|secure)\s*:/.test(relayP.slice(relayP.indexOf('function peerOpts()'))));
    }

    {   // the outside audit of 2026-10-01, the shell's windows (system/resources/app/shellguard.js): its rules run as plain functions, then main.js itself run over a recording stand-in for the electron module (tools/electronstub.js, a child process: Node and nothing else, no window, loopback only)
        let sg = null; try { sg = require('../system/resources/app/shellguard.js'); } catch (e) { sg = null; }
        const cpW = require('child_process'), EventsW = require('events');
        const OWN = 'http://localhost:3000', tryF = (f, d) => { try { return f(); } catch (e) { return d; } };
        const appDirW = path.join(__dirname, '..', 'system', 'app'), readApp = rel => fs.readFileSync(path.join(appDirW, rel), 'utf8').replace(/\r\n/g, '\n');

        // ---- the app's own windows and the links that leave it ----
        const kids = ['/?stream=1', '/?popout=doc:c_1/i_2', '/?popout=doc:c%201/p%2Fq', '/?popout=sheet:c_1/s_9', '/?popout=chat:'].map(p => OWN + p);
        const notKids = [OWN, OWN + '/', OWN + '/index.html', OWN + '/api/data', OWN + '/?reopen=doc%7Cx', OWN + '/?popout=', OWN + '/?popout', OWN + '/?popout=x:1', OWN + '/?popout=docs:1', OWN + '/saves/images/x.png', OWN + '/?stream=2', OWN + '/?stream=1&popout=', OWN + '/?popout=doc:a&stream=1', OWN + '/index.html?stream=1', OWN + '/?stream=1#x',
            'http://localhost:30001/?stream=1', 'http://127.0.0.1:3000/?stream=1', 'http://localhost.evil.example/?stream=1', 'http://localhost:3000@evil.example/?stream=1', 'http://user@localhost:3000/?stream=1', 'https://localhost:3000/?stream=1', 'file:///C:/x.html?stream=1', '', null, undefined, {}, ['http://localhost:3000/?stream=1']];
        check('windows (shellguard.childWindowOk, run for real): the only windows a page may open are the ones the app itself opens — the stream window (/?stream=1) and a popped-out page, sheet or chat (/?popout=doc:… | sheet:… | chat:…) at the app\'s own address; the front page, a file, an API route, the ?reopen fallback, an empty or unknown ?popout=, a second query, a fragment, another port, another spelling of this machine, a look-alike host, a user name in front, https, and anything that is no address open nothing',
            !!sg && kids.every(u => sg.childWindowOk(OWN, u) === true) && notKids.every(u => tryF(() => sg.childWindowOk(OWN, u), 'threw') === false), sg ? j([kids.filter(u => !sg.childWindowOk(OWN, u)), notKids.filter(u => tryF(() => sg.childWindowOk(OWN, u), 'threw') !== false)]) : 'no shellguard.js');
        const pop = sg ? sg.childWindowOptions(OWN + '/?popout=doc:a/b', 'ICON') : {}, strm = sg ? sg.childWindowOptions(OWN + '/?stream=1', 'ICON') : {};
        check('windows: a pop-out opens as a reading column (840 by 1000), the stream window landscape (1280 by 720), both with the main window\'s look and no menu bar, and neither is handed web preferences of its own (a child keeps the main window\'s: no Node, isolated, sandboxed)',
            j(pop) === j({ autoHideMenuBar: true, icon: 'ICON', width: 840, height: 1000, backgroundColor: '#15151c' }) && j(strm) === j({ autoHideMenuBar: true, icon: 'ICON', width: 1280, height: 720, backgroundColor: '#15151c' }), j([pop, strm]));
        const never = ['http://127.0.0.1:3000/', 'http://127.1:3000/', 'http://2130706433:3000/', 'http://0x7f.0.0.1:3000/x', 'http://user@localhost:3000/', 'http://LOCALHOST:3000/', 'http://localhost:3000/?stream=1', 'https://localhost:3000/', 'http://[::1]:3000/', 'http://[::ffff:127.0.0.1]:3000/', 'http://0.0.0.0:3000/', 'http://waypoint.localhost:3000/',
            'file:///C:/x.html', 'javascript:alert(1)', 'ms-settings:', 'someapp://x', 'data:text/html,x', 'about:blank', 'devtools://devtools/x', '', 'not an address', null, undefined, 7, {}, 'https://example.com/' + 'a'.repeat(9000)];
        const opens = [['https://example.com/', 'https://example.com/'], ['http://example.com/a?b=c#d', 'http://example.com/a?b=c#d'], ['mailto:a@b.c', 'mailto:a@b.c'], ['HTTPS://Example.com', 'https://example.com/'], ['http://localhost:8080/wiki', 'http://localhost:8080/wiki'], ['http://127.0.0.1:30001/', 'http://127.0.0.1:30001/'], ['http://localhost.evil.example:3000/', 'http://localhost.evil.example:3000/']];
        check('links (shellguard.webLinkOk, run for real): only a web page or a mail address ever reaches the system browser — never a file, a script, a settings page, a custom protocol or anything that is no address — and never the app\'s own server under any spelling of this machine (localhost in any case or with a user name, 127.0.0.1 written short, as one number or in hex, [::1], the mapped form, 0.0.0.0, a name under .localhost); a local tool on another port and a look-alike host are ordinary links',
            !!sg && never.every(u => tryF(() => sg.webLinkOk(3000, u), 'threw') === null) && opens.every(p => sg.webLinkOk(3000, p[0]) === p[1]), sg ? j([never.filter(u => tryF(() => sg.webLinkOk(3000, u), 'threw') !== null).map(u => String(u).slice(0, 40)), opens.filter(p => sg.webLinkOk(3000, p[0]) !== p[1])]) : 'no shellguard.js');
        const ownPages = [OWN, OWN + '/', OWN + '?x', OWN + '#x', OWN + '/?reopen=doc%7Cx', OWN + '/?popout=sheet:a/b', OWN + '/saves/images/a.png'];
        const strangers = ['https://evil.example/', 'http://localhost:3000.evil.example/', 'http://localhost.evil.example:3000/', 'http://localhost:30001/', 'http://localhost:3000@evil.example/', 'http://user@localhost:3000/', 'http://127.0.0.1:3000/', 'https://localhost:3000/', 'file:///C:/x.html', 'about:blank', 'null', '', null, undefined, {}];
        check('the app\'s own address (shellguard.isOwn, run for real) is its scheme, its name and its port exactly: its pages, files and the ?reopen fallback are its own; another port, another spelling of this machine, https, a look-alike host, a user name in front, a file and an empty origin are not',
            !!sg && ownPages.every(u => sg.isOwn(OWN, u) === true) && strangers.every(u => tryF(() => sg.isOwn(OWN, u), 'threw') === false) && sg.ownOrigin(3000) === OWN);

        // ---- permissions ----
        const ASK = ['fullscreen', 'clipboard-sanitized-write', 'fileSystem', 'local-network', 'local-network-access', 'loopback-network'];
        const OTHERS = ['media', 'geolocation', 'clipboard-read', 'deprecated-sync-clipboard-read', 'openExternal', 'notifications', 'display-capture', 'midi', 'midiSysex', 'pointerLock', 'keyboardLock', 'hid', 'usb', 'serial', 'idle-detection', 'window-management', 'speaker-selection', 'storage-access', 'top-level-storage-access', 'mediaKeySystem', 'background-sync', 'ar', 'unknown', '__proto__', 'constructor', 'toString', '', null, undefined, 7, {}, ['fullscreen']];
        const permRows = (url, chk) => ASK.concat(OTHERS).filter(p => tryF(() => sg.permOk(OWN, p, url, chk), 'threw') === true);
        check('permissions (shellguard.permOk, run for real): a page of the app\'s own address is granted exactly full screen, writing to the clipboard, the save-file picker and reaching this machine and the local network, and nothing else it asks for — not the camera or microphone, the location, reading the clipboard, opening another program, notifications, screen capture, a device, or a name the list only inherits; a check (which hands nothing over) also answers yes for media there, so tables connect as before, and for nothing more',
            !!sg && ownPages.every(u => j(permRows(u, false)) === j(ASK) && j(permRows(u, true)) === j(ASK.concat(['media']))), sg ? j([permRows(OWN + '/', false), permRows(OWN + '/', true)]) : 'no shellguard.js');
        check('permissions: any other address is granted nothing at all, asked or checked — a web site, a look-alike host, another port, another spelling of this machine, a file, an empty or missing address',
            !!sg && strangers.every(u => permRows(u, false).length === 0 && permRows(u, true).length === 0), sg ? j(strangers.filter(u => permRows(u, false).length || permRows(u, true).length)) : 'no shellguard.js');

        // ---- Developer mode ----
        const dirD = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-devmode-')), pf = (name, text) => { const f = path.join(dirD, name); if (text !== undefined) fs.writeFileSync(f, text); return f; };
        fs.mkdirSync(path.join(dirD, 'folder.json'));
        const modeOf = f => tryF(() => sg.devModeOf(f), 'threw');
        const offFiles = [pf('off.json', j({ updated: 1, prefs: { wp_devconsole: 'off' } })), pf('none.json', j({ updated: 1, prefs: { wp_rulers: 'off' } })), pf('absent.json'), path.join(dirD, 'folder.json'), pf('garbage.json', '{not json'), pf('empty.json', ''), pf('upper.json', j({ prefs: { wp_devconsole: 'ON' } })), pf('true.json', j({ prefs: { wp_devconsole: true } })),
            pf('one.json', j({ prefs: { wp_devconsole: 1 } })), pf('spaced.json', j({ prefs: { wp_devconsole: ' on' } })), pf('list.json', j({ prefs: ['on'] })), pf('top.json', j({ wp_devconsole: 'on' })), pf('proto.json', '{"prefs":{"__proto__":{"wp_devconsole":"on"}}}'), pf('null.json', 'null'), pf('text.json', '"on"'), pf('array.json', j([{ prefs: { wp_devconsole: 'on' } }]))];
        check('Developer mode (shellguard.devModeOf, run for real on files): on only when the mirrored settings file says exactly wp_devconsole "on"; off for "off", for a file without the key, for no file, an unreadable one, one that is no JSON, and for any other value (another case, true, 1, a space, a list, the key in the wrong place or only inherited)',
            !!sg && modeOf(pf('on.json', j({ updated: 5, prefs: { wp_devconsole: 'on', wp_rulers: 'off' } }))) === true && offFiles.every(f => modeOf(f) === false), sg ? j(offFiles.filter(f => modeOf(f) !== false).map(f => path.basename(f))) : 'no shellguard.js');
        // ---- the page's policy (cluster P of the outside audit): what a page of the app may run and load, by the mode the settings file says ----
        const STRICT = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self'; connect-src 'self' data: blob: https://0.peerjs.com wss://0.peerjs.com; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
        const DEVP = STRICT.replace("script-src 'self';", "script-src 'self' 'unsafe-eval';");
        const polOf = v => tryF(() => sg.pagePolicy(v), 'threw'), dirsOf = p => { const o = {}; String(p).split(';').forEach(d => { const w = d.trim().split(/\s+/); if (w[0]) o[w[0]] = w.slice(1); }); return o; };
        const dS = dirsOf(polOf(false)), dD = dirsOf(polOf(true)), NONE = j(["'none'"]);
        // a source that would open the policy: anything-goes, a bare scheme, a hash or a nonce, script written into the page, text run as code outside script-src, a host outside connect-src
        const looseIn = d => Object.keys(d).filter(k => d[k].some(src => src === '*' || /^(https?|wss?|ftp|filesystem):$/i.test(src) || /^'(unsafe-hashes|strict-dynamic|wasm-unsafe-eval|report-sample|nonce-|sha(256|384|512)-)/i.test(src) || (src === "'unsafe-inline'" && k !== 'style-src') || (src === "'unsafe-eval'" && k !== 'script-src') || (/^[a-z][a-z0-9+.-]*:\/\//i.test(src) && k !== 'connect-src') || ((src === 'data:' || src === 'blob:') && ['img-src', 'media-src', 'connect-src'].indexOf(k) < 0)));
        check('the page\'s policy (shellguard.pagePolicy, run for real): with Developer mode off — the default — script comes from the app\'s own files and nowhere else: no script written into the page, no handler attribute, no text run as code, no hash, no host; styles may be inline; pictures, sound and video are the app\'s own, data: and blob:; fonts the app\'s own; requests go to the app\'s own server, data:, blob: and the one signalling server (https and wss) and to no other address; no frame, no plug-in, no <base>, no form target, no worker, and no page may frame the app. Developer mode on adds text run as code to script-src and changes nothing else; only exactly true counts as on',
            !!sg && polOf(false) === STRICT && polOf(true) === DEVP && polOf() === STRICT && ['on', 1, 'true', undefined, null, {}, [], 0, '', 'ON'].every(v => polOf(v) === STRICT)
            && j(dS['default-src']) === j(["'self'"]) && j(dS['script-src']) === j(["'self'"]) && j(dD['script-src']) === j(["'self'", "'unsafe-eval'"]) && j(dS['style-src']) === j(["'self'", "'unsafe-inline'"]) && j(dS['font-src']) === j(["'self'"])
            && j(dS['img-src']) === j(["'self'", 'data:', 'blob:']) && j(dS['media-src']) === j(["'self'", 'data:', 'blob:']) && j(dS['connect-src']) === j(["'self'", 'data:', 'blob:', 'https://0.peerjs.com', 'wss://0.peerjs.com'])
            && ['worker-src', 'frame-src', 'object-src', 'base-uri', 'form-action', 'frame-ancestors'].every(k => j(dS[k]) === NONE && j(dD[k]) === NONE) && looseIn(dS).length === 0 && looseIn(dD).length === 0
            && Object.keys(dS).length === 13 && j(Object.keys(dS)) === j(Object.keys(dD)) && Object.keys(dS).every(k => k === 'script-src' || j(dS[k]) === j(dD[k])), j([polOf(false), polOf(true), looseIn(dS), looseIn(dD)]));
        const hdrOf = (mime, f) => tryF(() => sg.pageHeaders(mime, f), 'threw'), onFile = path.join(dirD, 'on.json');
        const pageTypes = ['text/html', 'text/html; charset=utf-8', 'TEXT/HTML', 'image/svg+xml'], otherTypes = ['application/javascript', 'application/javascript; charset=utf-8', 'text/css', 'image/png', 'video/mp4', 'audio/ogg', 'font/woff2', 'text/plain', 'application/json', 'text/htmlx', 'x-text/html', '', undefined, null];
        check('the page\'s policy by the settings file (shellguard.pageHeaders, run for real on files): a page of the app — an HTML or SVG document — is answered with the Developer mode policy only when the mirrored settings file says exactly wp_devconsole "on"; with "off", a file without the key, no file, a folder, a file that is no JSON, an empty one, another case, true, 1, a space, a list, the key in the wrong place or only inherited, and with no file named at all, it is answered with the strict one; a script, a stylesheet, a picture, a sound, a video, a font and data carry no policy (nothing of theirs can break), and every file of the app says its type is not to be guessed',
            !!sg && modeOf(onFile) === true && pageTypes.every(m => j(hdrOf(m, onFile)) === j({ 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': DEVP }))
            && offFiles.concat([undefined, null, '', 7, {}]).every(f => pageTypes.every(m => j(hdrOf(m, f)) === j({ 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': STRICT })))
            && otherTypes.every(m => j(hdrOf(m, onFile)) === j({ 'X-Content-Type-Options': 'nosniff' }) && j(hdrOf(m, offFiles[0])) === j({ 'X-Content-Type-Options': 'nosniff' })),
            sg ? j([hdrOf('text/html', onFile), offFiles.filter(f => j(hdrOf('text/html', f)) !== j({ 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': STRICT })).map(f => path.basename(String(f))), otherTypes.filter(m => j(hdrOf(m, onFile)) !== j({ 'X-Content-Type-Options': 'nosniff' }))]) : 'no shellguard.js');
        const stOf = m => tryF(() => sg.savesType(m), 'threw');
        const activeTypes = ['text/html', 'text/html; charset=utf-8', 'TEXT/HTML', 'application/javascript', 'application/javascript; charset=utf-8', 'text/javascript', 'application/ecmascript', 'text/css', 'text/css; charset=utf-8', 'application/xhtml+xml', 'text/xml', 'application/xml'];
        const inertTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/x-icon', 'font/woff2', 'text/plain', 'audio/mpeg', 'video/mp4', 'application/json', 'application/octet-stream'];
        check('a file under saves/ (shellguard.savesType, run for real): never answered as a page, a script or a stylesheet, whatever its name — those types become plain bytes, so the policy\'s "own files" never include a script someone put in the saves folder; a picture, a sound, a video, a font and text keep their own type',
            !!sg && activeTypes.every(m => stOf(m) === 'application/octet-stream') && inertTypes.every(m => stOf(m) === m), sg ? j([activeTypes.filter(m => stOf(m) !== 'application/octet-stream'), inertTypes.filter(m => stOf(m) !== m)]) : 'no shellguard.js');
        try { fs.rmSync(dirD, { recursive: true, force: true }); } catch (e) {}
        const rolesOf = t => { const out = []; (function walk(list) { (list || []).forEach(i => { if (i.role) out.push(i.role); if (i.label && !i.role) out.push('label:' + i.label); if (Array.isArray(i.submenu)) walk(i.submenu); }); })(t); return out; };
        const mOff = sg ? sg.menuTemplate(false, 'win32') : [], mOn = sg ? sg.menuTemplate(true, 'win32') : [], mMac = sg ? sg.menuTemplate(false, 'darwin') : [];
        const helpless = t => !/help/i.test(j(t)) && !/"role":"(window|windowMenu|fileMenu|viewMenu|help|about)"/.test(j(t));
        check('Developer mode (shellguard.menuTemplate, run for real): the application menu is Waypoint\'s own — one short View menu with Reload, Actual size, Zoom in, Zoom out and Full screen (so Ctrl+R, Ctrl+0 / + / - and F11 keep working), no Help menu in either mode — and Developer tools is on it only while Developer mode is on (true, and nothing else, counts as on)',
            j(rolesOf(mOff)) === j(['label:View', 'reload', 'resetZoom', 'zoomIn', 'zoomOut', 'togglefullscreen']) && j(rolesOf(mOn)) === j(['label:View', 'reload', 'resetZoom', 'zoomIn', 'zoomOut', 'togglefullscreen', 'toggleDevTools']) && mOff.length === 1 && mOn.length === 1 && helpless(mOff) && helpless(mOn)
            && ['on', 1, undefined, null, {}].every(v => j(sg.menuTemplate(v, 'win32')) === j(mOff)) && j(rolesOf(mMac).slice(0, 2)) === j(['appMenu', 'editMenu']) && rolesOf(mMac).indexOf('toggleDevTools') < 0, j([rolesOf(mOff), rolesOf(mOn), rolesOf(mMac)]));
        const toolKeys = [{ type: 'keyDown', key: 'I', code: 'KeyI', control: true, shift: true }, { type: 'keyDown', key: 'J', code: 'KeyJ', control: true, shift: true }, { type: 'keyDown', key: 'C', code: 'KeyC', control: true, shift: true }, { type: 'keyDown', key: 'F12', code: 'F12' },
            { type: 'keyUp', key: 'i', code: 'KeyI', control: true, shift: true }, { type: 'keyDown', key: 'i', code: '', control: true, shift: true }, { type: 'keyDown', key: 'F12', code: 'F12', control: true, shift: true }, { type: 'keyDown', key: 'i', code: 'KeyI', meta: true, alt: true }];
        const plainKeys = [{ type: 'keyDown', key: 'i', code: 'KeyI' }, { type: 'keyDown', key: 'i', code: 'KeyI', control: true }, { type: 'keyDown', key: 'I', code: 'KeyI', shift: true }, { type: 'keyDown', key: 'c', code: 'KeyC', control: true }, { type: 'keyDown', key: 'K', code: 'KeyK', control: true, shift: true }, { type: 'keyDown', key: 'F11', code: 'F11' },
            { type: 'keyDown', key: 'r', code: 'KeyR', control: true }, { type: 'keyDown', key: '0', code: 'Digit0', control: true }, { type: 'keyDown', key: '`', code: 'Backquote' }, { type: 'keyDown', key: 'Z', code: 'KeyZ', control: true, shift: true }, null, undefined, 'F12', {}];
        check('Developer mode (shellguard.devToolsKey, run for real): the keys that open the developer tools are Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C and F12 (going down or coming up, by the key or by its place on the keyboard); a letter alone, Ctrl+C, Ctrl+R, Ctrl+0, Ctrl+Shift+Z, F11 and ~ are not',
            !!sg && toolKeys.every(k => sg.devToolsKey(k) === true) && plainKeys.every(k => tryF(() => sg.devToolsKey(k), 'threw') === false));

        // ---- the one address the update walk-through may open ----
        const REPO = 'ImmuneMoon/Waypoint', GH = 'https://github.com/' + REPO;
        const relOk = [GH + '/releases/download/1.5.0/Waypoint_Setup.exe', GH + '/releases/tag/1.5.0', GH + '/releases/latest', GH + '/releases'];
        const relNo = ['https://release-assets.githubusercontent.com/github-production-release-asset/1/x', 'https://objects.githubusercontent.com/x', GH + '/raw/0123abc/Waypoint_Setup.exe', GH + '/archive/0123abc.zip', GH + '/files/1/x.zip', GH + '/releases/../raw/a/x.exe', GH + '/releasesX/x', GH + '/', GH,
            'https://user@github.com/' + REPO + '/releases/latest', 'https://github.com:444/' + REPO + '/releases/latest', 'http://github.com/' + REPO + '/releases/x', 'https://github.com/evil/repo/releases/download/1/Waypoint_Setup.exe', 'https://github.com.evil.example/' + REPO + '/releases/x', 'https://github.com/' + REPO + '/../../evil/repo/releases/x',
            'file:///C:/x.exe', [GH + '/releases/latest'], { url: GH + '/releases/latest' }, null, undefined, '', GH + '/releases/' + 'a'.repeat(3000)];
        check('the update walk-through\'s link (shellguard.releaseLink, run for real): only this project\'s own release pages on github.com are opened — the installer\'s download, a release\'s page, the latest, the list; a download host that serves every project\'s files, another part of the project (a file by commit, an archive, an attachment), a path that climbs out, a user name, a port, http, another project, a look-alike host, a file, a list, an object, nothing, and an over-long address are refused',
            !!sg && relOk.every(u => sg.releaseLink(u, REPO) === u) && relNo.every(u => tryF(() => sg.releaseLink(u, REPO), 'threw') === null) && sg.releaseLink(relOk[0], '') === null, sg ? j([relOk.filter(u => sg.releaseLink(u, REPO) !== u), relNo.filter(u => tryF(() => sg.releaseLink(u, REPO), 'threw') !== null).map(u => String(u).slice(0, 60))]) : 'no shellguard.js');

        // ---- the local server holds both loopback addresses, or moves on ----
        const free = () => new Promise(r => { const s = http.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
        const has6 = await new Promise(r => { const s = http.createServer(); s.once('error', () => r(false)); s.listen({ port: 0, host: '::1', ipv6Only: true }, () => s.close(() => r(true))); });
        const getL = (host, port, pathName, method) => new Promise(resolve => {
            const rq = http.request({ host, port, path: pathName || '/', method: method || 'GET', agent: false, headers: { Host: 'localhost:' + port } }, rs => { let d = ''; rs.on('data', c => { d += c; }); rs.on('end', () => resolve(d || String(rs.statusCode))); });
            rq.on('error', e => resolve(String(e && e.code))); rq.setTimeout(5000, () => { const e = new Error('no answer'); e.code = 'ETIMEDOUT'; rq.destroy(e); }); rq.end();
        });
        // A machine may listen on [::1] and still be unable to dial it (a VPN or a filter that blocks IPv6 answers "not permitted" to every connection, the loopback included).
        // Nothing on such a machine can reach [::1] either, the app's window included, so what [::1] would answer is not read there: the listens, the ports and 127.0.0.1 still are.
        const dial6 = has6 && await new Promise(r => { const sv = http.createServer((q, rs) => rs.end('X')); sv.unref(); sv.once('error', () => r(false)); sv.listen({ port: 0, host: '::1', ipv6Only: true }, () => { getL('::1', sv.address().port).then(v => sv.close(() => r(v === 'X'))); }); });
        const get6 = (port, blind, pathName) => dial6 ? getL('::1', port, pathName) : Promise.resolve(blind);
        const NOTE6 = has6 && !dial6 ? ' (this machine listens on [::1] but cannot dial it — a VPN or a filter blocks IPv6 — so what [::1] answers is not read here)' : '';
        const pair = () => { const a = http.createServer((q, r) => r.end('OURS')), b = http.createServer((q, r) => a.emit('request', q, r)); a.unref(); b.unref(); return [a, b]; };
        const other = (host, port) => new Promise(r => { const s = http.createServer((q, rs) => rs.end('OTHER')); s.unref(); s.once('error', () => r(null)); s.listen({ port, host, ipv6Only: host === '::1' }, () => r(s)); });
        const hold = (a, b, port, tries) => new Promise(resolve => { let n = 0, got; if (!sg) return resolve({ port: -1, calls: 0 }); sg.listenLoopback(a, b, port, p => { n++; if (n === 1) { got = p; setTimeout(() => resolve({ port: got, calls: n }), 120); } }, tries); });
        const shut = list => Promise.all(list.filter(Boolean).map(s => new Promise(r => { try { s.close(() => r()); } catch (e) { r(); } setTimeout(r, 300).unref(); })));
        {
            const P = await free(), [a, b] = pair(), r = await hold(a, b, P);
            const v4 = await getL('127.0.0.1', P), v6 = has6 ? await get6(P, 'OURS') : 'OURS', late = has6 ? await other('::1', P) : null;
            check('the local server\'s address (shellguard.listenLoopback, run for real): on a free port it holds 127.0.0.1 and [::1] alike, both answered by the app\'s own handler, tells its caller once, and another program can no longer take [::1] on that port' + (has6 ? '' : ' (this machine has no IPv6 loopback: 127.0.0.1 alone)') + NOTE6,
                r.port === P && r.calls === 1 && v4 === 'OURS' && v6 === 'OURS' && late === null, j([r, v4, v6, !!late]));
            await shut([a, b, late]);
        }
        if (has6) {
            const P = await free(), o6 = await other('::1', P), [a, b] = pair(), r = await hold(a, b, P);
            const v4 = await getL('127.0.0.1', r.port), v6 = await get6(r.port, 'OURS'), left = await getL('127.0.0.1', P), theirs = await get6(P, 'OTHER');
            check('the local server\'s address: with another program already on [::1] of the port it asks for, it does not settle there (a window loading "localhost" would be shown that program\'s page as the app) — it moves to another port where both addresses are its own, leaves nothing of its own on the first port, and tells its caller once' + NOTE6,
                !!o6 && r.port > 0 && r.port !== P && r.calls === 1 && v4 === 'OURS' && v6 === 'OURS' && left === 'ECONNREFUSED' && theirs === 'OTHER', j([P, r, v4, v6, left, theirs]));
            await shut([a, b]);
            const [c, d] = pair(), r0 = await hold(c, d, P, 0), left0 = await getL('127.0.0.1', P);
            check('the local server\'s address: asked to take that port or none (the dev server, whose port is named), it holds nothing and says so (0), once', r0.port === 0 && r0.calls === 1 && left0 === 'ECONNREFUSED', j([r0, left0]));
            await shut([c, d, o6]);
            const P2 = await free(), o4 = await other('127.0.0.1', P2), [e, f] = pair(), r2 = await hold(e, f, P2);
            const w4 = await getL('127.0.0.1', r2.port), w6 = await get6(r2.port, 'OURS'), left6 = await get6(P2, 'ECONNREFUSED');
            check('the local server\'s address: with another program on 127.0.0.1 of the port it moves on as before, both addresses its own on the new port and [::1] of the first port left alone' + NOTE6,
                !!o4 && r2.port > 0 && r2.port !== P2 && r2.calls === 1 && w4 === 'OURS' && w6 === 'OURS' && left6 === 'ECONNREFUSED', j([P2, r2, w4, w6, left6]));
            await shut([e, f, o4]);
        } else check('the local server\'s address: this machine has no IPv6 loopback, so the cases with another program on [::1] cannot be made here (127.0.0.1 alone is checked above and below)', true);
        {
            const no6 = code => { const s = new EventsW(); s.listen = () => { setImmediate(() => s.emit('error', Object.assign(new Error(code), { code }))); }; s.close = cb => { if (cb) cb(); }; return s; };
            const P = await free(), [a] = pair(), r = await hold(a, no6('EADDRNOTAVAIL'), P), v4 = await getL('127.0.0.1', P); await shut([a]);
            const Pb = await free(), [c] = pair(), rb = await hold(c, no6('EAFNOSUPPORT'), Pb), vb = await getL('127.0.0.1', Pb); await shut([c]);
            const Pc = await free(), [e] = pair(), rc = await hold(e, no6('EACCES'), Pc, 0), vc = await getL('127.0.0.1', Pc); await shut([e]);
            const Pd = await free(), [g] = pair(), rd = await hold(g, no6('EADDRINUSE'), Pd, 0), vd = await getL('127.0.0.1', Pd); await shut([g]);
            const Pe = await free(), [h] = pair(), re = await hold(h, no6('EPROTONOSUPPORT'), Pe, 0), ve = await getL('127.0.0.1', Pe); await shut([h]);
            check('the local server\'s address: on a machine with no IPv6 loopback to bind (the bind answers that the address does not exist, that the family is not supported, or anything else that is not "in use") nobody else can listen there either, so 127.0.0.1 alone is taken on the port asked for and the app still starts; "in use" and "not permitted" on [::1] count as the port being taken',
                r.port === P && r.calls === 1 && v4 === 'OURS' && rb.port === Pb && rb.calls === 1 && vb === 'OURS' && re.port === Pe && re.calls === 1 && ve === 'OURS' && rc.port === 0 && rc.calls === 1 && vc === 'ECONNREFUSED' && rd.port === 0 && rd.calls === 1 && vd === 'ECONNREFUSED', j([r, v4, rb, vb, re, ve, rc, vc, rd, vd]));
        }

        // ---- the dev server's update guard: the folder it may change ----
        {
            const dirS = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-sysdir-')), ownS = path.join(dirS, 'repo', 'system'), scratchS = path.join(dirS, 'scratch', 'system');
            fs.mkdirSync(ownS, { recursive: true }); fs.mkdirSync(scratchS, { recursive: true });
            let linked = null; try { fs.symlinkSync(ownS, path.join(dirS, 'link'), 'junction'); linked = path.join(dirS, 'link'); } catch (e) { linked = null; }
            const sd = n => tryF(() => sg.scratchSystemDir(ownS, n), 'threw');
            const same = [ownS, ownS + path.sep, path.join(ownS, '..', 'system'), path.join(dirS, 'repo', '.', 'system')].concat(process.platform === 'win32' ? [ownS.toUpperCase(), ownS.toLowerCase() + '\\'] : []).concat(linked ? [linked] : []);
            check('the dev server\'s update guard (shellguard.scratchSystemDir, run for real): the folder its Update and Restore may change is only one named on purpose that is not the source tree\'s own system folder — unnamed, empty, or the tree\'s own under any spelling (a trailing separator, a path that climbs and comes back' + (process.platform === 'win32' ? ', another case' : '') + (linked ? ', a link to it' : '') + ') gives none; a scratch copy gives its path',
                !!sg && [undefined, null, '', '   ', 7, {}].every(n => sd(n) === null) && same.every(n => sd(n) === null) && sd(scratchS) === path.resolve(scratchS) && sd(path.join(dirS, 'not-made-yet')) === path.resolve(path.join(dirS, 'not-made-yet')), sg ? j([same.filter(n => sd(n) !== null), sd(scratchS)]) : 'no shellguard.js');
            try { fs.rmSync(dirS, { recursive: true, force: true }); } catch (e) {}
        }

        // ---- main.js itself, over the recording stand-in ----
        const stub = (plan, prefs, files) => new Promise(resolve => {
            const rootW = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-shell-'));
            fs.mkdirSync(path.join(rootW, 'system', 'app'), { recursive: true }); fs.writeFileSync(path.join(rootW, 'system', 'app', 'index.html'), '<!doctype html><title>scratch</title>');
            if (prefs !== undefined) { fs.mkdirSync(path.join(rootW, 'saves')); fs.writeFileSync(path.join(rootW, 'saves', 'preferences.json'), prefs); }
            Object.keys(files || {}).forEach(rel => { const f = path.join(rootW, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, files[rel]); });   // more files of the scratch install: its app folder's, its saves folder's
            fs.writeFileSync(path.join(rootW, 'plan.json'), j(plan.map(s => s[1])));
            free().then(basePort => {
                const child = cpW.spawn(process.execPath, [path.join(__dirname, 'electronstub.js'), rootW, String(basePort), path.join(rootW, 'plan.json')], { stdio: ['ignore', 'pipe', 'pipe'] });
                let out = '', err = ''; child.stdout.on('data', c => { out += c; }); child.stderr.on('data', c => { err += c; });
                const t = setTimeout(() => { try { child.kill(); } catch (e) {} }, 60000);
                child.on('exit', () => {
                    clearTimeout(t); try { fs.rmSync(rootW, { recursive: true, force: true }); } catch (e) {}
                    let r = null; try { r = JSON.parse(out); } catch (e) { r = null; }
                    const by = {}; if (r && Array.isArray(r.steps)) plan.forEach((s, i) => { by[s[0]] = r.steps[i] || {}; });
                    resolve({ r: r || { order: [], windows: [], menus: [], handlers: [], steps: [], errors: [] }, by, err: err.slice(0, 400), ok: !!r && r.started === true && r.held === true });
                });
            });
        });
        const hasTools = t => /toggleDevTools/.test(j(t || null));
        const foreign = ['http://127.0.0.1:{PORT}/x', 'https://example.com/a', 'http://localhost.evil.example/', '{OWN}@evil.example/', 'http://localhost:8080/tool', 'file:///C:/x.html', 'ms-settings:', 'javascript:alert(1)', 'mailto:a@b.c', '{OWN}/', '{OWN}/api/data', '{OWN}/?popout='];
        const planA = [];
        planA.push(['wc1', { do: 'wc', url: '{OWN}/?popout=doc:a/b' }], ['wc2', { do: 'wc', url: '{OWN}/?popout=chat:' }]);
        [0, 1, 2].forEach(w => {
            foreign.forEach((u, i) => planA.push(['open' + w + '_' + i, { do: 'open', wc: w, url: u }]));
            planA.push(['pop' + w, { do: 'open', wc: w, url: '{OWN}/?popout=doc:a/b' }], ['stream' + w, { do: 'open', wc: w, url: '{OWN}/?stream=1' }], ['chat' + w, { do: 'open', wc: w, url: '{OWN}/?popout=chat:' }]);
            planA.push(['navWeb' + w, { do: 'nav', wc: w, url: 'https://example.com/a' }], ['navOld' + w, { do: 'nav', wc: w, url: 'https://example.com/b', old: true }], ['navFile' + w, { do: 'nav', wc: w, url: 'file:///C:/x.html' }], ['navApp' + w, { do: 'nav', wc: w, url: 'ms-settings:' }], ['navTwin' + w, { do: 'nav', wc: w, url: '{OWN}.evil.example/' }],
                ['navOwn' + w, { do: 'nav', wc: w, url: '{OWN}/?reopen=doc%7Cx' }], ['navOwnOld' + w, { do: 'nav', wc: w, url: '{OWN}/', old: true }], ['webview' + w, { do: 'webview', wc: w }]);
            toolKeys.slice(0, 4).forEach((k, i) => planA.push(['keyOff' + w + '_' + i, { do: 'key', wc: w, input: k }]));
            planA.push(['keyPlain' + w, { do: 'key', wc: w, input: { type: 'keyDown', key: 'r', code: 'KeyR', control: true } }], ['toolsOff' + w, { do: 'devtools', wc: w }]);
        });
        ASK.concat(['media', 'openExternal', 'clipboard-read', 'notifications', 'geolocation', 'display-capture', 'hid', 'nonsense']).forEach(p => planA.push(['askOwn_' + p, { do: 'ask', wc: 0, perm: p, url: '{OWN}/' }], ['askWeb_' + p, { do: 'ask', wc: 1, perm: p, url: 'https://example.com/' }], ['askTwin_' + p, { do: 'ask', wc: 1, perm: p, url: '{OWN}.evil.example/' }],
            ['chkOwn_' + p, { do: 'check', wc: 0, perm: p, origin: '{OWN}/' }], ['chkBare_' + p, { do: 'check', wc: 0, perm: p, origin: '{OWN}' }], ['chkWeb_' + p, { do: 'check', wc: 1, perm: p, origin: 'https://example.com' }], ['chkNone_' + p, { do: 'check', wc: null, perm: p, origin: '' }]));
        planA.push(['askByPage', { do: 'ask', wc: 0, perm: 'fullscreen', noDetails: true }], ['elsewhere', { do: 'url', wc: 2, url: 'https://example.com/' }], ['askByPageWeb', { do: 'ask', wc: 2, perm: 'fullscreen', noDetails: true }], ['askNobody', { do: 'ask', wc: null, perm: 'fullscreen', noDetails: true }]);
        planA.push(['state0', { do: 'state' }],
            ['prefsOn', { do: 'http', method: 'POST', path: '/api/prefs', body: { updated: 1, prefs: { wp_devconsole: 'on', wp_rulers: 'off' } } }], ['state1', { do: 'state' }]);
        toolKeys.slice(0, 4).forEach((k, i) => planA.push(['keyOn_' + i, { do: 'key', wc: 1, input: k }]));
        planA.push(['toolsOn1', { do: 'devtools', wc: 1 }], ['toolsOn2', { do: 'devtools', wc: 2 }], ['state2', { do: 'state' }],
            ['prefsSame', { do: 'http', method: 'POST', path: '/api/prefs', body: { updated: 2, prefs: { wp_devconsole: 'on' } } }], ['state3', { do: 'state' }],
            ['prefsOff', { do: 'http', method: 'POST', path: '/api/prefs', body: { updated: 3, prefs: { wp_devconsole: 'off' } } }], ['state4', { do: 'state' }], ['keyBack', { do: 'key', wc: 0, input: toolKeys[0] }],
            ['prefsOdd', { do: 'http', method: 'POST', path: '/api/prefs', body: { updated: 4, prefs: { wp_devconsole: 'ON' } } }], ['state5', { do: 'state' }],
            ['prefsOn2', { do: 'http', method: 'POST', path: '/api/prefs', body: { updated: 5, prefs: { wp_devconsole: 'on' } } }], ['prefsBad', { do: 'http', method: 'POST', path: '/api/prefs', body: '{not json' }], ['state6', { do: 'state' }],
            ['prefsGone', { do: 'http', method: 'POST', path: '/api/prefs', body: { updated: 6, prefs: {} } }], ['state7', { do: 'state' }],
            ['extHost', { do: 'http', method: 'POST', path: '/api/open-external', body: { url: 'https://release-assets.githubusercontent.com/x/Waypoint_Setup.exe' } }], ['extRaw', { do: 'http', method: 'POST', path: '/api/open-external', body: { url: GH + '/raw/0123abc/Waypoint_Setup.exe' } }],
            ['extList', { do: 'http', method: 'POST', path: '/api/open-external', body: { url: [GH + '/releases/latest'] } }], ['extNone', { do: 'http', method: 'POST', path: '/api/open-external', body: '{not json' }], ['extGood', { do: 'http', method: 'POST', path: '/api/open-external', body: { url: GH + '/releases/download/1.5.0/Waypoint_Setup.exe' } }],
            ['ping4', { do: 'http', path: '/api/ping' }], ['ping6', { do: 'http', path: '/api/ping', v6: true }], ['page6', { do: 'http', path: '/', v6: true }]);
        const A = await stub(planA), a = A.by, ord = A.r.order, at = name => ord.indexOf(name), firstWin = at('new BrowserWindow');
        check('main.js run for real over a recording stand-in for the electron module (tools/electronstub.js: Node alone, a scratch folder, loopback only): it starts, holds the port it loads, loads http://localhost:<port>, and before its first window is made it has registered for every window\'s contents, set the permission handlers and set its own menu; the main window is still a web page and nothing more (no Node, isolated, sandboxed, no webview) and nothing it logged was an error',
            A.ok && A.r.loaded === 'http://localhost:' + A.r.port && firstWin > 0 && at('app.on:web-contents-created') >= 0 && at('app.on:web-contents-created') < firstWin && at('permission requests') >= 0 && at('permission requests') < firstWin && at('permission checks') >= 0 && at('permission checks') < firstWin && at('menu') >= 0 && at('menu') < firstWin && at('loadURL') > firstWin
            && A.r.windows.length === 1 && j(A.r.windows[0].webPreferences) === j({ nodeIntegration: false, contextIsolation: true, sandbox: true, webviewTag: false }) && A.r.windows[0].autoHideMenuBar === true && A.r.errors.length === 0 && A.r.quit === 0, j([A.ok, A.r.loaded, ord, A.r.windows, A.r.errors, A.err]));
        const everyWin = fn => [0, 1, 2].every(fn), extOf = k => j((a[k] || {}).ext || null);
        check('every window is guarded, not the main one alone (main.js run for real: the main window\'s contents, a pop-out\'s, and a window opened from the pop-out): each has a new-window rule and a navigation rule of its own, and each refuses a webview',
            A.ok && A.r.handlers.length === 3 && A.r.handlers.every(h => h.open === true && h.nav === 1 && h.webview === 1 && h.keys === 1 && h.tools === 1) && everyWin(w => a['webview' + w].prevented === true), j(A.r.handlers));
        check('a link clicked in any window (main.js run for real, the main window, a pop-out and a window opened from one alike): a web page, a mail address, a look-alike host and a local tool on another port open in the system browser and never in a window of the app; another spelling of the app\'s own server, a file, a settings page and a script open nothing anywhere; the app\'s own front page, an API route and an empty ?popout= open no second copy of the app',
            A.ok && everyWin(w => foreign.every((u, i) => a['open' + w + '_' + i].action === 'deny' && a['open' + w + '_' + i].width === undefined)
                && extOf('open' + w + '_1') === j(['https://example.com/a']) && extOf('open' + w + '_2') === j(['http://localhost.evil.example/']) && extOf('open' + w + '_8') === j(['mailto:a@b.c']) && [0, 5, 6, 7, 9, 10, 11].every(i => extOf('open' + w + '_' + i) === '[]')
                && /^\["http:\/\/localhost:\d+@evil\.example\/"\]$/.test(extOf('open' + w + '_3')) && extOf('open' + w + '_4') === j(['http://localhost:8080/tool'])), j([0, 1, 2].map(w => foreign.map((u, i) => [a['open' + w + '_' + i].action, a['open' + w + '_' + i].ext]))));
        check('the app\'s own windows still open from any window (main.js run for real): a popped-out page and the chat pop-out as a reading column, the stream window landscape, nothing handed to the system browser',
            A.ok && everyWin(w => a['pop' + w].action === 'allow' && a['pop' + w].width === 840 && a['pop' + w].height === 1000 && a['chat' + w].action === 'allow' && a['chat' + w].width === 840 && a['stream' + w].action === 'allow' && a['stream' + w].width === 1280 && a['stream' + w].height === 720
                && a['pop' + w].webPreferences === undefined && extOf('pop' + w) === '[]' && extOf('stream' + w) === '[]' && extOf('chat' + w) === '[]'), j([0, 1, 2].map(w => [a['pop' + w], a['stream' + w], a['chat' + w]])));
        check('no window leaves the app\'s own pages (main.js run for real, each window): a navigation to a web page is stopped and that page opened in the system browser instead — whether the engine names the address in the event or as its second argument —, one to a file, a settings page or a look-alike host is stopped; the app\'s own pages (the ?reopen fallback, a reload) are let through',
            A.ok && everyWin(w => a['navWeb' + w].prevented === true && extOf('navWeb' + w) === j(['https://example.com/a']) && a['navOld' + w].prevented === true && extOf('navOld' + w) === j(['https://example.com/b']) && a['navFile' + w].prevented === true && extOf('navFile' + w) === '[]' && a['navApp' + w].prevented === true && extOf('navApp' + w) === '[]'
                && a['navTwin' + w].prevented === true && a['navOwn' + w].prevented === false && a['navOwnOld' + w].prevented === false && extOf('navOwn' + w) === '[]'), j([0, 1, 2].map(w => [a['navWeb' + w], a['navOld' + w], a['navFile' + w], a['navTwin' + w], a['navOwn' + w], a['navOwnOld' + w]])));
        const granted = (pre, list) => list.filter(p => (a[pre + p] || {}).granted === true), allPerms = ASK.concat(['media', 'openExternal', 'clipboard-read', 'notifications', 'geolocation', 'display-capture', 'hid', 'nonsense']);
        check('permissions as the shell answers them (main.js run for real): both handlers are set; a page of the app\'s own address asking is granted full screen, clipboard writing, the save-file picker and the network and refused the camera and microphone, opening another program, reading the clipboard, notifications, the location, screen capture, a device and an unknown name; a web site and a look-alike host are refused everything; a check answers the same, plus media for the app\'s own address (with or without the trailing slash), and nothing where no page is named; a request that names no address is judged by the window it came from',
            A.ok && A.r.ask === true && A.r.check === true && j(granted('askOwn_', allPerms)) === j(ASK) && granted('askWeb_', allPerms).length === 0 && granted('askTwin_', allPerms).length === 0 && j(granted('chkOwn_', allPerms)) === j(ASK.concat(['media'])) && j(granted('chkBare_', allPerms)) === j(ASK.concat(['media']))
            && granted('chkWeb_', allPerms).length === 0 && granted('chkNone_', allPerms).length === 0 && allPerms.every(p => typeof a['askOwn_' + p].granted === 'boolean' && typeof a['chkWeb_' + p].granted === 'boolean') && a.askByPage.granted === true && a.askByPageWeb.granted === false && a.askNobody.granted === false,
            j([granted('askOwn_', allPerms), granted('askWeb_', allPerms), granted('chkOwn_', allPerms), granted('chkWeb_', allPerms), granted('chkNone_', allPerms), a.askByPage, a.askByPageWeb, a.askNobody]));
        check('Developer mode off (main.js run for real with no settings file): the menu Waypoint sets has no Developer tools and no Help; in every window Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C and F12 are swallowed and Ctrl+R is not; developer tools that open anyway are closed at once',
            A.ok && a.state0.menus === 1 && !hasTools(a.state0.menu) && helpless(a.state0.menu) && j(rolesOf(a.state0.menu)) === j(['label:View', 'reload', 'resetZoom', 'zoomIn', 'zoomOut', 'togglefullscreen'])
            && everyWin(w => [0, 1, 2, 3].every(i => a['keyOff' + w + '_' + i].prevented === true) && a['keyPlain' + w].prevented === false && a['toolsOff' + w].open === false) && j(a.state0.closed) === j([1, 1, 1]), j([a.state0, [0, 1, 2].map(w => [0, 1, 2, 3].map(i => a['keyOff' + w + '_' + i].prevented))]));
        check('Developer mode follows the settings file as the page writes it (main.js run for real, POST /api/prefs): switched on, the menu is set again with Developer tools, none of the four keys is swallowed and opened tools stay open; a write that leaves it on sets no new menu; switched off, the menu is set again without Developer tools, every window\'s open tools are closed and the keys are swallowed again; any value other than "on" is off; a body that is no JSON changes nothing; a file without the key is off',
            A.ok && a.prefsOn.code === 200 && a.state1.menus === 2 && hasTools(a.state1.menu) && helpless(a.state1.menu) && [0, 1, 2, 3].every(i => a['keyOn_' + i].prevented === false) && a.toolsOn1.open === true && a.toolsOn2.open === true && j(a.state2.devOpen) === j([false, true, true])
            && a.prefsSame.code === 200 && a.state3.menus === 2 && j(a.state3.devOpen) === j([false, true, true])
            && a.prefsOff.code === 200 && a.state4.menus === 3 && !hasTools(a.state4.menu) && j(a.state4.devOpen) === j([false, false, false]) && j(a.state4.closed) === j([1, 2, 2]) && a.keyBack.prevented === true
            && a.prefsOdd.code === 200 && a.state5.menus === 3 && !hasTools(a.state5.menu)
            && a.prefsOn2.code === 200 && a.prefsBad.code === 400 && a.state6.menus === 4 && hasTools(a.state6.menu) && a.prefsGone.code === 200 && a.state7.menus === 5 && !hasTools(a.state7.menu),
            j([a.prefsOn, a.state1 && a.state1.menus, a.state2, a.state3 && a.state3.menus, a.prefsOff, a.state4, a.keyBack, a.state5 && a.state5.menus, a.prefsBad, a.state6 && a.state6.menus, a.state7 && a.state7.menus]));
        check('the update walk-through\'s link as the shell takes it (main.js run for real, POST /api/open-external): a download host that serves every project\'s files, a file by commit, a list in place of an address and a body that is no JSON are refused with an answer (400) and open nothing; the installer\'s own download link is opened, as the address the parser made of it',
            A.ok && a.extHost.code === 400 && extOf('extHost') === '[]' && a.extRaw.code === 400 && extOf('extRaw') === '[]' && a.extList.code === 400 && extOf('extList') === '[]' && a.extNone.code === 400 && extOf('extNone') === '[]' && a.extGood.code === 200 && extOf('extGood') === j([GH + '/releases/download/1.5.0/Waypoint_Setup.exe']),
            j([a.extHost, a.extRaw, a.extList, a.extNone, a.extGood]));
        check('the shell\'s own server answers on both loopback addresses of its port (main.js run for real): 127.0.0.1 and' + (has6 ? ' [::1], the app\'s page served there too' : ' — this machine has no IPv6 loopback — 127.0.0.1 alone') + NOTE6,
            A.ok && a.ping4.code === 200 && (has6 && dial6 ? a.ping6.code === 200 && a.page6.code === 200 && /scratch/.test(a.page6.text) : true), j([a.ping4, a.ping6, a.page6]));
        const planB = [['state0', { do: 'state' }], ['wc1', { do: 'wc', url: '{OWN}/?stream=1' }], ['tools0', { do: 'devtools', wc: 0 }], ['tools1', { do: 'devtools', wc: 1 }], ['navTools', { do: 'nav', wc: 1, url: 'https://example.com/x' }], ['state1', { do: 'state' }]];
        toolKeys.slice(0, 4).forEach((k, i) => planB.push(['key' + i, { do: 'key', wc: 0, input: k }]));
        const toolsWin = [['wcT', { do: 'wc', url: 'devtools://devtools/bundled/devtools_app.html' }], ['navInTools', { do: 'nav', wc: 0, url: 'devtools://devtools/bundled/other.html' }]];   // the developer tools' own window: wc is set to its number below
        planB.push(toolsWin[0], ['navInTools', Object.assign({}, toolsWin[1][1], { wc: 2 })]);
        const B = await stub(planB, j({ updated: 9, prefs: { wp_devconsole: 'on' } })), b = B.by;
        const C = await stub([['state0', { do: 'state' }], ['key', { do: 'key', wc: 0, input: toolKeys[0] }], ['tools', { do: 'devtools', wc: 0 }], toolsWin[0], ['navInTools', Object.assign({}, toolsWin[1][1], { wc: 1 })]], '{"updated":9,"prefs":{"wp_devconsole":"on"');
        check('Developer mode at launch (main.js run for real with a settings file already there): a file that says "on" starts with Developer tools on the menu, the keys let through and opened tools left open — an install that had the console on keeps it —, while a link in a window still goes to the system browser and the window the developer tools open in is left to itself; a file cut short (unreadable) starts off: no Developer tools, the key swallowed, tools closed at once, and nothing navigates anywhere but to the pages of the app itself',
            B.ok && b.state0.menus === 1 && hasTools(b.state0.menu) && helpless(b.state0.menu) && b.tools0.open === true && b.tools1.open === true && [0, 1, 2, 3].every(i => b['key' + i].prevented === false) && b.navTools.prevented === true && j(b.navTools.ext) === j(['https://example.com/x']) && j(b.state1.closed) === j([0, 0])
            && b.navInTools.prevented === false && j(b.navInTools.ext) === '[]' && C.ok && C.by.state0.menus === 1 && !hasTools(C.by.state0.menu) && C.by.key.prevented === true && C.by.tools.open === false && C.by.navInTools.prevented === true && j(C.by.navInTools.ext) === '[]', j([B.ok, b.state0, b.tools0, b.navTools, C.ok, C.by.state0, C.by.key, C.by.tools, B.err, C.err]));

        // ---- the page's policy as the shell sends it (main.js run for real) ----
        {
            const filesP = { 'system/app/scripts/x.js': 'var x = 1;', 'system/app/style.css': 'body{}', 'system/app/assets/a.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>', 'system/app/assets/a.png': 'PNG', 'system/app/assets/a.ogg': 'OGG', 'system/app/assets/a.txt': 'text', 'system/app/assets/a.woff2': 'W',
                'saves/images/m/a.png': 'PNG', 'saves/images/m/a.js': 'window.__x = 1;', 'saves/images/m/a.html': '<script>1</script>', 'saves/images/m/a.css': 'body{}', 'saves/images/m/a.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>', 'saves/images/m/a.mp3': 'ID3', 'saves/images/m/a.json': '{}' };
            const get = p => ({ do: 'http', path: p }), set = (n, prefs) => ({ do: 'http', method: 'POST', path: '/api/prefs', body: { updated: n, prefs: prefs } });
            const planP = [['page', get('/')], ['index', get('/index.html')], ['stream', get('/?stream=1')], ['pop', get('/?popout=chat:')], ['doc', get('/?popout=doc:c_1/i_2')],
                ['js', get('/scripts/x.js')], ['css', get('/style.css')], ['svg', get('/assets/a.svg')], ['png', get('/assets/a.png')], ['ogg', get('/assets/a.ogg')], ['txt', get('/assets/a.txt')], ['font', get('/assets/a.woff2')], ['api', get('/api/version')], ['ping', get('/api/ping')], ['none', get('/nothing.html')],
                ['sPng', get('/saves/images/m/a.png')], ['sJs', get('/saves/images/m/a.js')], ['sHtml', get('/saves/images/m/a.html')], ['sCss', get('/saves/images/m/a.css')], ['sSvg', get('/saves/images/m/a.svg')], ['sMp3', get('/saves/images/m/a.mp3')], ['sJson', get('/saves/images/m/a.json')],
                ['on', set(1, { wp_devconsole: 'on' })], ['pageOn', get('/')], ['streamOn', get('/?stream=1')], ['popOn', get('/?popout=chat:')], ['jsOn', get('/scripts/x.js')], ['sHtmlOn', get('/saves/images/m/a.html')],
                ['off', set(2, { wp_devconsole: 'off' })], ['pageOff', get('/')], ['odd', set(3, { wp_devconsole: 'ON' })], ['pageOdd', get('/')], ['on2', set(4, { wp_devconsole: 'on' })], ['pageOn2', get('/')], ['gone', set(5, {})], ['pageGone', get('/')]];
            const Pn = await stub(planP, undefined, filesP), p = Pn.by, hd = k => { const r = p[k] || {}, h = r.h || {}; return [r.code, h.csp === undefined ? 'no headers reported' : h.csp, h.sniff, String(h.type || '').split(';')[0]]; };
            const POn = await stub([['page', get('/')], ['stream', get('/?stream=1')]], j({ updated: 9, prefs: { wp_devconsole: 'on' } })), PCut = await stub([['page', get('/')]], '{"updated":9,"prefs":{"wp_devconsole":"on"');
            const hOf = (run, k) => { const r = run.by[k] || {}, h = r.h || {}; return [r.code, h.csp, h.sniff, String(h.type || '').split(';')[0]]; };
            check('the page\'s policy as the shell sends it (main.js run for real over the stand-in, a scratch install with no settings file): the app\'s page — the front page, index.html, the stream window, a chat and a page pop-out — is answered with the strict policy and "do not guess my type"; a script, a stylesheet, a picture, a sound, a font and a text file of the app carry no policy and the same type header; an SVG of the app, which is a document when opened, carries the policy; an API answer and a file that is not there carry none',
                Pn.ok && ['page', 'index', 'stream', 'pop', 'doc'].every(k => j(hd(k)) === j([200, STRICT, 'nosniff', 'text/html'])) && j(hd('js')) === j([200, null, 'nosniff', 'application/javascript']) && j(hd('css')) === j([200, null, 'nosniff', 'text/css']) && j(hd('svg')) === j([200, STRICT, 'nosniff', 'image/svg+xml'])
                && j(hd('png')) === j([200, null, 'nosniff', 'image/png']) && j(hd('ogg')) === j([200, null, 'nosniff', 'audio/ogg']) && j(hd('txt')) === j([200, null, 'nosniff', 'text/plain']) && j(hd('font')) === j([200, null, 'nosniff', 'font/woff2'])
                && j(hd('api')) === j([200, null, null, 'application/json']) && hd('ping')[1] === null && hd('none')[0] === 404 && hd('none')[1] === null, j([Pn.ok, ['page', 'index', 'stream', 'pop', 'doc', 'js', 'css', 'svg', 'png', 'ogg', 'txt', 'font', 'api', 'none'].map(hd), Pn.err]));
            check('a file under saves/ as the shell sends it (main.js run for real): still sandboxed and never type-guessed, and one named as a page, a script or a stylesheet is answered as plain bytes — in either mode — while a picture, an SVG, a sound and a data file keep their own type',
                Pn.ok && j(hd('sPng')) === j([200, 'sandbox', 'nosniff', 'image/png']) && ['sJs', 'sHtml', 'sCss', 'sHtmlOn'].every(k => j(hd(k)) === j([200, 'sandbox', 'nosniff', 'application/octet-stream'])) && j(hd('sSvg')) === j([200, 'sandbox', 'nosniff', 'image/svg+xml'])
                && j(hd('sMp3')) === j([200, 'sandbox', 'nosniff', 'audio/mpeg']) && j(hd('sJson')) === j([200, 'sandbox', 'nosniff', 'text/plain']), j(['sPng', 'sJs', 'sHtml', 'sCss', 'sSvg', 'sMp3', 'sJson', 'sHtmlOn'].map(hd)));
            check('the page\'s policy follows the settings file at each page (main.js run for real, POST /api/prefs then the page again): switched on, the very next page — and the stream window and a pop-out — carries the Developer mode policy while a script still carries none; switched off, the next page is strict again; a value that is not exactly "on" is strict; on again, then a file without the key, strict; a shell started with the file already saying "on" sends the Developer mode policy from its first page, and one started with a file cut short sends the strict one',
                Pn.ok && p.on.code === 200 && ['pageOn', 'streamOn', 'popOn', 'pageOn2'].every(k => j(hd(k)) === j([200, DEVP, 'nosniff', 'text/html'])) && j(hd('jsOn')) === j([200, null, 'nosniff', 'application/javascript'])
                && ['pageOff', 'pageOdd', 'pageGone'].every(k => j(hd(k)) === j([200, STRICT, 'nosniff', 'text/html'])) && POn.ok && j(hOf(POn, 'page')) === j([200, DEVP, 'nosniff', 'text/html']) && j(hOf(POn, 'stream')) === j([200, DEVP, 'nosniff', 'text/html'])
                && PCut.ok && j(hOf(PCut, 'page')) === j([200, STRICT, 'nosniff', 'text/html']), j([['pageOn', 'streamOn', 'popOn', 'jsOn', 'pageOff', 'pageOdd', 'pageOn2', 'pageGone'].map(hd), POn.ok && hOf(POn, 'page'), PCut.ok && hOf(PCut, 'page')]));
        }

        // ---- the wiring, pinned ----
        const sgSrc = tryF(() => fs.readFileSync(path.join(__dirname, '..', 'system', 'resources', 'app', 'shellguard.js'), 'utf8').replace(/\r\n/g, '\n'), '');
        const extA = main.indexOf("if (url.pathname === '/api/open-external' && req.method === 'POST') {"), extB = main.indexOf("if (url.pathname === '/api/ping') {"), extSrc = extA > 0 && extB > extA ? main.slice(extA, extB) : '';
        check('main.js, pinned: the rules are shellguard\'s and are installed before the first window is made (no rule is set on the main window\'s contents alone any more); the window\'s own preferences are as they were and the developer tools are never switched off for good (the mode can change while the app runs) nor opened by the shell; the local server listens through listenLoopback, never on 127.0.0.1 alone, and the page is still loaded from http://localhost:<port>; a settings file written tells the guard; the walk-through\'s link is judged by releaseLink and what is opened is its answer, never the request\'s own value',
            /const shellguard = require\('\.\/shellguard'\);/.test(main) && main.indexOf('shellguard.install(require(\'electron\'), {') > 0 && main.indexOf('shellguard.install(require(\'electron\'), {') < main.indexOf('new BrowserWindow(') && !/win\.webContents\.(setWindowOpenHandler|on)\(/.test(main) && !/setWindowOpenHandler|will-navigate/.test(main)
            && /webPreferences: \{ nodeIntegration: false, contextIsolation: true, sandbox: true, webviewTag: false \}/.test(main) && !/devTools\s*:/.test(main) && !/openDevTools/.test(main) && !/openDevTools/.test(sgSrc) && !/devTools\s*:\s*false/.test(sgSrc)
            && /shellguard\.listenLoopback\(server, server6, port, /.test(main) && !/\.listen\(port, '127\.0\.0\.1'/.test(main) && /win\.loadURL\(`http:\/\/localhost:\$\{port\}`\);/.test(main) && /const server6 = http\.createServer\(\(req, res\) => server\.emit\('request', req, res\)\);/.test(main)
            && /fs\.renameSync\(tmp, prefsFile\);\n\s*if \(guard\) guard\.refresh\(\);/.test(main) && /prefsFile: path\.join\(savesDir, 'preferences\.json'\)/.test(main)
            && /const link = shellguard\.releaseLink\(target, UPDATE_REPO\);/.test(extSrc) && /shell\.openExternal\(link\);/.test(extSrc) && !/openExternal\(target\)/.test(main) && !/githubusercontent/.test(main));
        check('the dev server, pinned: it listens through the same listenLoopback on the port it was given or not at all (never on 127.0.0.1 alone), and says so and exits when either address of that port is taken; the folder its updater may change is shellguard\'s answer, and a POST to any of the updater\'s routes is refused (409) before the updater is reached while there is none — it names no update path of its own',
            /const shellguard = require\('\.\.\/system\/resources\/app\/shellguard'\);/.test(dev) && /shellguard\.listenLoopback\(server, server6, port, /.test(dev) && !/\.listen\(port, '127\.0\.0\.1'/.test(dev) && /const server6 = http\.createServer\(\(req, res\) => server\.emit\('request', req, res\)\);/.test(dev) && /process\.exit\(1\)/.test(dev)
            && /const scratchSystem = shellguard\.scratchSystemDir\(ownSystem, process\.env\.WAYPOINT_SYSTEM_DIR\);/.test(dev) && /systemDir: scratchSystem \|\| ownSystem,/.test(dev) && !/process\.env\.WAYPOINT_SYSTEM_DIR \|\|/.test(dev)
            && dev.indexOf("if (!scratchSystem && req.method === 'POST' && updater.UPDATE_ROUTES.includes(url.pathname)) {") > dev.indexOf('if (!localRequest(req))') && dev.indexOf("if (!scratchSystem && req.method === 'POST' && updater.UPDATE_ROUTES.includes(url.pathname)) {") < dev.indexOf('updateHandler(req, res, url); return; }') && !/'\/api\/update-/.test(dev));

        // ---- the dev server itself on both loopback addresses ----
        {
            const savesL = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-devloop-')), devJs = path.join(__dirname, 'dev-server.js');
            const start = port => new Promise(resolve => {
                const ch = cpW.spawn(process.execPath, [devJs, savesL, String(port)], { stdio: ['ignore', 'pipe', 'pipe'] }); let out = '', done = false;
                const fin = v => { if (!done) { done = true; clearTimeout(t); resolve(Object.assign({ child: ch, out: () => out }, v)); } }, t = setTimeout(() => fin({ up: false, code: 'timeout' }), 15000);
                ch.stdout.on('data', c => { out += c; if (/Waypoint dev server: http/.test(out)) fin({ up: true }); }); ch.stderr.on('data', c => { out += c; }); ch.on('exit', code => fin({ up: false, code }));
            });
            const stop = ch => new Promise(r => { if (ch.exitCode !== null) return r(); const t = setTimeout(r, 2000); ch.on('exit', () => { clearTimeout(t); r(); }); try { ch.kill(); } catch (e) { r(); } });
            const P = await free(), d1 = await start(P), p4 = d1.up ? await getL('127.0.0.1', P, '/api/ping') : 'down', p6 = d1.up && has6 ? await get6(P, '200', '/api/ping') : '200';
            await stop(d1.child);
            const P2 = await free(), blocker = await other(has6 ? '::1' : '127.0.0.1', P2), d2 = await start(P2), left = has6 ? await getL('127.0.0.1', P2, '/api/ping') : 'ECONNREFUSED';
            await stop(d2.child); await shut([blocker]);
            check('the dev server run for real on a scratch saves folder: it answers on 127.0.0.1 and' + (has6 ? ' [::1]' : ' (no IPv6 loopback here) 127.0.0.1 alone') + ' of its port; with another program already on ' + (has6 ? '[::1]' : '127.0.0.1') + ' of the port it was given it does not start beside it — it says the port is taken, exits 1 and leaves nothing listening' + NOTE6,
                d1.up === true && p4 === '200' && p6 === '200' && !!blocker && d2.up === false && d2.code === 1 && /is taken/.test(d2.out()) && left === 'ECONNREFUSED', j([d1.up, p4, p6, d2.up, d2.code, d2.out().slice(0, 200), left]));
            try { fs.rmSync(savesL, { recursive: true, force: true }); } catch (e) {}
        }

        // ---- the Electron this build packs is a recorded fact ----
        {
            const pkgW = tryF(() => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'system', 'resources', 'app', 'package.json'), 'utf8')), {}), relSrc = fs.readFileSync(path.join(__dirname, 'release.js'), 'utf8').replace(/\r\n/g, '\n');
            const rA = relSrc.indexOf('// [servercheck:runtime-start]'), rB = relSrc.indexOf('// [servercheck:runtime-end]');
            const note = rA > 0 && rB > rA ? tryF(() => new Function(relSrc.slice(rA, rB) + '\nreturn runtimeNote;')(), null) : null;
            let onDisk = null; try { onDisk = fs.readFileSync(path.join(__dirname, '..', 'system', 'version'), 'utf8').trim(); } catch (e) { onDisk = null; }   // the runtime itself is not in the repository: only a checkout that holds it can compare
            const N = (rec, got) => tryF(() => note(rec, got), 'threw');
            check('the runtime (release.js runtimeNote, sliced and run for real): the shell\'s package.json records the Electron version the installer packs, as a plain version' + (onDisk ? ' — the one this checkout holds under system/' : '') + '; the build says nothing when the record and system/version agree, and one plain line (never a refusal) when they differ, when system/version cannot be read, or when nothing is recorded',
                typeof pkgW.electron === 'string' && /^\d+\.\d+\.\d+$/.test(pkgW.electron) && (onDisk === null || onDisk === pkgW.electron) && typeof note === 'function' && N('44.1.0', '44.1.0') === null && N('44.1.0', '44.1.0\n') === null
                && [N('44.1.0', '44.5.1'), N('44.1.0', null), N(undefined, '44.1.0'), N('', ''), N(7, {})].every(s => typeof s === 'string' && s.length > 20 && s.indexOf('\n') < 0) && /44\.5\.1/.test(N('44.1.0', '44.5.1')) && /44\.1\.0/.test(N('44.1.0', '44.5.1')), j([pkgW.electron, onDisk, typeof note, N('44.1.0', '44.5.1'), N('44.1.0', null), N(undefined, '44.1.0')]));
            check('the runtime, pinned in release.js: the note is made from package.json\'s record and system/version, printed as a warning and nothing more (no exit, no network), and the release manifest carries the recorded version beside minShell',
                /const RUNTIME_NOTE = runtimeNote\(pkg\.electron, bundledElectron\(\)\);/.test(relSrc) && /if \(RUNTIME_NOTE\) console\.warn\(RUNTIME_NOTE\);/.test(relSrc) && !/RUNTIME_NOTE\)[^\n]*process\.exit/.test(relSrc)
                && /JSON\.stringify\(\{ version: VERSION, minShell: SHELL_SINCE, built: new Date\(\)\.toISOString\(\), electron: typeof pkg\.electron === 'string' \? pkg\.electron : null \}, null, 2\)/.test(relSrc) && !/registry\.npmjs/.test(relSrc));
        }

        // ---- the page: the Developer mode switch (settings.js sliced by its markers) and the ~ key (devconsole.js), run on a page of plain objects ----
        {
            const stSrc = readApp('scripts/settings.js'), dA = stSrc.indexOf('// [servercheck:devmode-start]'), dB = stSrc.indexOf('// [servercheck:devmode-end]');
            const WORDS = 'Developer mode opens tools that can change or break your campaigns, your settings and Waypoint itself if they are used incorrectly. Only type or paste something into them when you know what it does \u2014 never because someone asked you to. Turn Developer mode on?';
            const LIVE = 'Leave or end the multiplayer session first.', SAID_ON = 'Developer mode is on \u2014 Waypoint reloads to finish switching it on.', SAID_OFF = 'Developer mode is off \u2014 Waypoint reloads to finish switching it off.';
            const ownD = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
            // the switch on a page of plain objects: the store, the session's store, the question, the toast, the save and settings pushes, the reload and its timer are all recorded; written() says the settings file is on disk, tick() runs the timers
            const rigD = (start, o) => {
                o = o || {};
                const store = {}, sess = {}, log = { asks: [], toasts: [], closed: 0, synced: 0, sets: [], reloads: 0, timers: [], flushed: 0, pushes: 0, casts: [], order: [] }; if (start !== undefined) store.wp_devconsole = start; if (o.note !== undefined) sess.wp_devmodeNote = o.note;
                const localStorage = { getItem: k => (ownD(store, k) ? store[k] : null), setItem: (k, v) => { if (o.full) throw new Error('quota'); store[k] = String(v); log.sets.push([k, String(v)]); } };
                const sessionStorage = { getItem: k => (ownD(sess, k) ? sess[k] : null), setItem: (k, v) => { sess[k] = String(v); }, removeItem: k => { delete sess[k]; } };
                const btn = { handlers: {}, addEventListener(t, fn) { this.handlers[t] = fn; } }, ui = id => (id === 'setDevConsoleBtn' ? btn : null);
                const dialogs = () => ({ then(fn) { fn({ showConfirm(msg, cb, opts) { log.asks.push({ msg, cb, opts }); } }); } });
                let settle = null;
                const win = { wpDevConsole: { close() { log.closed++; } }, wpHistFlush() { log.flushed++; log.order.push('flush'); } }; if (o.net) win.wpNet = o.net;
                if (o.push !== 'none') win.wpPrefsPush = () => { log.pushes++; log.order.push('push'); if (o.push === 'throws') throw new Error('x'); if (o.push === 'plain') return undefined; return { then(ok, bad) { settle = o.push === 'fails' ? bad : ok; } }; };
                const location = { reload() { log.reloads++; log.order.push('reload'); } };
                const setTimeout = (fn, ms) => { log.timers.push({ fn, ms }); return log.timers.length; };
                function BroadcastChannel(name) { this.postMessage = m => { log.casts.push([name, m && m.type]); log.order.push('cast'); }; }
                let ok = true;
                try { new Function('ui', 'localStorage', 'window', 'toast', 'syncPanel', 'dialogs', 'location', 'setTimeout', 'sessionStorage', 'BroadcastChannel', '"use strict";\n' + stSrc.slice(dA, dB).split("import('./dialogs.js')").join('dialogs()'))(ui, localStorage, win, m => log.toasts.push(String(m)), () => { log.synced++; }, dialogs, location, setTimeout, sessionStorage, BroadcastChannel); } catch (e) { ok = false; }
                return { ok: ok && dA > 0 && dB > dA, log, store, sess, win, click: () => btn.handlers.click && btn.handlers.click(), answer: (yes, n) => { const q = log.asks[n === undefined ? log.asks.length - 1 : n]; if (q) q.cb(yes); },
                    written: () => { if (settle) { const s = settle; settle = null; s(); } }, tick: () => { const t = log.timers.splice(0); t.forEach(x => x.fn()); return t.map(x => x.ms); } };
            };
            const r1 = rigD(undefined); r1.click(); const asked1 = r1.log.asks.length, before1 = r1.store.wp_devconsole; r1.answer(false); const afterNo = [r1.store.wp_devconsole, r1.log.sets.length, r1.log.toasts.length, r1.log.pushes, r1.log.timers.length, r1.log.reloads];
            r1.click(); const asked2 = r1.log.asks.length; r1.answer(true); const afterYes = [r1.store.wp_devconsole, r1.log.toasts.slice(-1)[0], r1.log.synced, r1.sess.wp_devmodeNote, r1.log.flushed, r1.log.pushes, r1.log.timers.length, r1.log.casts.length, r1.log.reloads];
            r1.click(); r1.click(); const waiting = [r1.log.asks.length, r1.store.wp_devconsole, r1.log.toasts.length, r1.log.pushes];   // the page is about to reload: nothing more is switched
            r1.written(); const onDisk = [j(r1.log.casts), r1.log.timers.map(t => t.ms), r1.log.reloads]; const waited = r1.tick(), reloaded = [r1.log.reloads, r1.log.order.join()];
            const rOff = rigD('on'); rOff.click(); const offNow = [rOff.store.wp_devconsole, rOff.log.asks.length, rOff.log.closed, rOff.log.toasts.slice(-1)[0], rOff.log.synced, rOff.sess.wp_devmodeNote, rOff.log.pushes, rOff.log.reloads]; rOff.written(); rOff.tick(); const offReloaded = [rOff.log.reloads, rOff.log.order.join()];
            const liveOn = rigD(undefined, { net: { active: true } }); liveOn.click(); const liveOff = rigD('on', { net: { active: true } }); liveOff.click();
            const liveLate = rigD(undefined, { net: { active: false } }); liveLate.click(); liveLate.win.wpNet.active = true; liveLate.answer(true);
            const liveRows = [liveOn, liveOff, liveLate].map(r => [r.store.wp_devconsole, r.log.toasts.join('|'), r.log.asks.length, r.log.closed, r.log.pushes, r.log.timers.length, r.log.reloads, r.sess.wp_devmodeNote]);
            const r2 = rigD('off'); r2.click(); const offAsks = r2.log.asks.length; r2.answer(false);
            const r6 = rigD(undefined); r6.click(); r6.click(); r6.click(); const once = r6.log.asks.length; r6.answer(false); r6.click(); const twice = r6.log.asks.length;
            const r4 = rigD('ON'); r4.click(); const r5 = rigD(undefined, { full: true }); r5.click(); let full = 'ok'; try { r5.answer(true); } catch (e) { full = 'threw'; }
            const fullRow = [r5.store.wp_devconsole, r5.log.pushes, r5.log.timers.length, r5.log.reloads, r5.sess.wp_devmodeNote, /could not be switched/.test(r5.log.toasts.slice(-1)[0] || '')];
            const pushRows = ['fails', 'none', 'throws', 'plain'].map(kind => { const r = rigD(undefined, { push: kind }); r.click(); r.answer(true); r.written(); const ms = r.tick(); return [kind, r.store.wp_devconsole, ms, r.log.reloads]; });
            const noteOn = rigD('on', { note: 'on' }), noteOnT = [noteOn.log.timers.length, noteOn.sess.wp_devmodeNote, noteOn.log.toasts.length]; noteOn.tick();
            const noteOff = rigD('off', { note: 'off' }); noteOff.tick(); const noteStale = rigD('off', { note: 'on' }); noteStale.tick(); const noNote = rigD('on');
            check('the Developer mode switch (settings.js sliced by its devmode markers, run on a page of plain objects): switching it on asks first, every time, in the app\'s own question (never one Enter answers), with the warning\'s words, one question at a time (a second click while it is open asks nothing more); nothing is stored until Yes, and No leaves the value as it was with nothing said, nothing sent and no reload; a value that is not exactly "on" counts as off; a store that cannot be written stops nothing, says so, and reloads nothing',
                r1.ok && asked1 === 1 && before1 === undefined && r1.log.asks[0].msg === WORDS && j(r1.log.asks[0].opts) === j({ noEnter: true }) && j(afterNo) === j([undefined, 0, 0, 0, 0, 0]) && asked2 === 2 && r1.log.asks[1].msg === WORDS && afterYes[0] === 'on'
                && r2.ok && offAsks === 1 && r2.store.wp_devconsole === 'off' && r2.log.reloads === 0 && r4.ok && r4.log.asks.length === 1 && r4.store.wp_devconsole === 'ON' && r5.ok && full === 'ok' && j(fullRow) === j([undefined, 0, 0, 0, undefined, true]) && r6.ok && once === 1 && twice === 2,
                j([r1.ok, asked1, r1.log.asks[0] && r1.log.asks[0].msg === WORDS, afterNo, afterYes, offAsks, r4.log.asks.length, full, fullRow, once, twice]));
            check('the Developer mode switch reloads the page, because the page\'s policy is set when it loads (the same slice, run for real): Yes stores "on", says "Developer mode is on \u2014 Waypoint reloads to finish switching it on.", writes any edit still waiting, sends the settings to the file and waits for that write — no reload before the file says so — then tells a stream window to reload and reloads 900 ms later, once; a click meanwhile switches nothing; switching it off asks nothing, stores "off", closes the in-app console, says it reloads and reloads the same way; a settings write that fails, a page with no settings file route and a route that answers nothing still reload',
                j(afterYes) === j(['on', SAID_ON, 1, 'on', 1, 1, 0, 0, 0]) && j(waiting) === j([2, 'on', 1, 1]) && j(onDisk) === j([j([['waypoint', 'reload']]), [900], 0]) && j(waited) === j([900]) && j(reloaded) === j([1, 'flush,push,cast,reload'])
                && rOff.ok && j(offNow) === j(['off', 0, 1, SAID_OFF, 1, 'off', 1, 0]) && j(offReloaded) === j([1, 'flush,push,cast,reload']) && j(pushRows) === j([['fails', 'on', [900], 1], ['none', 'on', [900], 1], ['throws', 'on', [900], 1], ['plain', 'on', [900], 1]]),
                j([afterYes, waiting, onDisk, waited, reloaded, offNow, offReloaded, pushRows]));
            check('the Developer mode switch is refused while a multiplayer session is live, in the words the update buttons use (a reload would drop the table): on or off, nothing is asked, stored, closed, sent or reloaded; a session that began while the question was open refuses the Yes the same way',
                liveOn.ok && liveOff.ok && liveLate.ok && j(liveRows) === j([[undefined, LIVE, 0, 0, 0, 0, 0, undefined], ['on', LIVE, 0, 0, 0, 0, 0, undefined], [undefined, LIVE, 1, 0, 0, 0, 0, undefined]]) && /toast\('Leave or end the multiplayer session first\.'\)/.test(stSrc.slice(stSrc.indexOf('function runHotUpdate()'))), j(liveRows));
            check('after that reload the switch says once what it did (the same slice run on a page whose session holds the note): on — and the stored value still on — says what Developer mode unlocks (~ for the console, Ctrl+Shift+I in the installed app); off says "Developer mode off."; a note that no longer matches the stored value says nothing; the note is spent either way, and a page with no note says nothing',
                noteOn.ok && j(noteOnT) === j([1, undefined, 0]) && noteOn.log.toasts.length === 1 && /^Developer mode on/.test(noteOn.log.toasts[0]) && /~/.test(noteOn.log.toasts[0]) && /Ctrl\+Shift\+I/.test(noteOn.log.toasts[0]) && noteOn.log.reloads === 0
                && j(noteOff.log.toasts) === j(['Developer mode off.']) && noteOff.sess.wp_devmodeNote === undefined && noteStale.log.toasts.length === 0 && noteStale.sess.wp_devmodeNote === undefined && noNote.log.timers.length === 0 && noNote.log.toasts.length === 0, j([noteOnT, noteOn.log.toasts, noteOff.log.toasts, noteStale.log.toasts]));
            {   // the settings mirror's push (scripts/bootprefs.js, run for real on a page of plain objects): what the reload waits for
                const bpSrc = (() => { try { return readApp('scripts/bootprefs.js'); } catch (e) { return ''; } })();
                const rigB = fails => {
                    const m = { wp_devconsole: 'on', wp_theme: 'light', other: 'x', wp_prefsStamp: '5' }, posts = []; let done = null, ok = true;
                    function Storage() {} Storage.prototype.setItem = function(k, v) { m[k] = String(v); }; Storage.prototype.removeItem = function(k) { delete m[k]; };
                    const ls = new Storage(); Object.defineProperty(ls, 'length', { get: () => Object.keys(m).length }); ls.key = i => Object.keys(m)[i]; ls.getItem = k => (ownD(m, k) ? m[k] : null);
                    const win = {}, fetchB = (url, opt) => { posts.push([url, opt && opt.method, opt && opt.body]); return new Promise((res, rej) => { done = fails ? () => rej(new Error('offline')) : () => res({ ok: true }); }); };
                    try { new Function('window', 'localStorage', 'Storage', 'fetch', 'setTimeout', 'clearTimeout', 'Date', bpSrc)(win, ls, Storage, fetchB, () => 1, () => {}, { now: () => 77 }); } catch (e) { ok = false; }
                    return { ok, win, posts, finish: () => done && done() };
                };
                const state = p => Promise.race([Promise.resolve(p).then(() => 'done', () => 'rejected'), new Promise(r => setTimeout(() => r('waiting'), 30))]);
                const b1 = rigB(false), w1 = b1.ok && b1.win.wpPrefsPush ? b1.win.wpPrefsPush() : null, s1a = await state(w1 || new Promise(() => {})); b1.finish(); const s1b = await state(w1 || new Promise(() => {}));
                const b2 = rigB(true), w2 = b2.ok && b2.win.wpPrefsPush ? b2.win.wpPrefsPush() : null; b2.finish(); const s2 = await state(w2 || new Promise(() => {}));
                const sent = (() => { try { return JSON.parse(b1.posts[0][2]); } catch (e) { return null; } })();
                check('the settings mirror\'s push (scripts/bootprefs.js, run for real): it sends every wp_ setting but its own stamp to /api/prefs and hands back a promise that settles only when the file was written — what the Developer mode reload waits for — and settles, never rejects, when the write fails',
                    b1.ok && !!w1 && typeof w1.then === 'function' && s1a === 'waiting' && s1b === 'done' && b1.posts.length === 1 && b1.posts[0][0] === '/api/prefs' && b1.posts[0][1] === 'POST' && !!sent && sent.updated === 77 && j(sent.prefs) === j({ wp_devconsole: 'on', wp_theme: 'light' }) && b2.ok && s2 === 'done',
                    j([b1.ok, !!w1, s1a, s1b, b1.posts, s2]));
            }
            const dcSrc = readApp('scripts/devconsole.js');
            const tilde = value => {
                const els = {}, el = id => (els[id] || (els[id] = { id, style: {}, value: '', children: [], addEventListener() {}, appendChild(c) { this.children.push(c); }, focus() {} }));
                const handlers = [], winD = { addEventListener(t, fn) { if (t === 'keydown') handlers.push(fn); } };
                const doc = { getElementById: id => (/^devConsole(Log|Input)?$/.test(id) ? el(id) : null), createElement: () => ({ style: {} }) };
                const ls = { getItem: k => (k === 'wp_devconsole' ? value : null), setItem() {} };
                let ran = true; try { new Function('window', 'document', 'localStorage', 'setTimeout', dcSrc)(winD, doc, ls, () => 0); } catch (e) { ran = false; }
                const ev = { code: 'Backquote', key: '`', target: { tagName: 'BODY' }, prevented: false, preventDefault() { this.prevented = true; } };
                handlers.forEach(h => h(ev));
                return [ran, handlers.length, ev.prevented, el('devConsole').style.display === 'flex'];
            };
            check('the ~ key (devconsole.js run for real on a page of plain objects): with Developer mode off — no value, "off", or anything that is not exactly "on" — it opens nothing and is left to the page; with it on it opens the in-app console',
                j(tilde(null)) === j([true, 1, false, false]) && j(tilde('off')) === j([true, 1, false, false]) && j(tilde('ON')) === j([true, 1, false, false]) && j(tilde('on')) === j([true, 1, true, true]), j([tilde(null), tilde('off'), tilde('on')]));
            const runDc = evalFn => {
                const els = {}, mk = id => ({ id, style: {}, value: '', children: [], handlers: {}, addEventListener(t, fn) { this.handlers[t] = fn; }, appendChild(c) { this.children.push(c); }, focus() {} }), el = id => (els[id] || (els[id] = mk(id)));
                const winD = { pushed: 0, addEventListener() {}, wpPrefsPush() { winD.pushed++; } };
                const doc = { getElementById: id => (/^devConsole(Log|Input)?$/.test(id) ? el(id) : null), createElement: () => ({ style: {} }) };
                let ran = true; try { new Function('window', 'document', 'localStorage', 'setTimeout', 'eval', dcSrc)(winD, doc, { getItem: k => (k === 'wp_devconsole' ? 'on' : null), setItem() {} }, () => 0, evalFn); winD.wpDevConsole.open(); } catch (e) { ran = false; }
                const type = text => { try { el('devConsoleInput').value = text; el('devConsoleInput').handlers.keydown({ key: 'Enter', preventDefault() {} }); } catch (e) { ran = false; } const c = el('devConsoleLog').children; return c.length ? [c[c.length - 1].className, String(c[c.length - 1].textContent)] : ['', '']; };
                return { type, win: winD, ok: () => ran, count: () => el('devConsoleLog').children.length };
            };
            const refused = () => { throw new EvalError("Refused to evaluate a string as JavaScript because 'unsafe-eval' is not an allowed source of script"); };
            const cStrict = runDc(refused), lineS = cStrict.type('1 + 1'), nS = cStrict.count(), helpS = cStrict.type('/help'), lineS2 = cStrict.type('2 + 2');
            const cDev = runDc(src => { if (src === '1 + 1') return 2; if (src === '0') return 0; if (src === 'mine') throw new EvalError('thrown by what was typed'); throw new TypeError('not a thing'); }), lineD = cDev.type('1 + 1'), lineE = cDev.type('nope()'), lineM = cDev.type('mine');
            check('the in-app console where the page was loaded under the strict policy (devconsole.js run for real, its eval refused as the engine refuses it): what is typed is not run and the console says so in one plain line — Developer mode is on but this window was loaded before it was, reload Waypoint — never the engine\'s own error and never silence; it sends the settings to the file so the reload finds the mode on; the / commands still work; where the policy allows it, typed JavaScript runs and an error it throws (an EvalError of its own too) is shown as that error',
                cStrict.ok() && lineS[0] === 'dc-line dc-note' && /^Developer mode is on, but this window was loaded before it was switched on/.test(lineS[1]) && /[Rr]eload Waypoint/.test(lineS[1]) && !/Refused|EvalError|unsafe-eval/.test(lineS[1]) && cStrict.win.pushed >= 1 && helpS[0] !== 'dc-line dc-err' && cStrict.count() > nS && lineS2[0] === 'dc-line dc-note'
                && cDev.ok() && j(lineD) === j(['dc-line dc-out', '2']) && lineE[0] === 'dc-line dc-err' && /TypeError: not a thing/.test(lineE[1]) && lineM[0] === 'dc-line dc-err' && /thrown by what was typed/.test(lineM[1]) && cDev.win.pushed === 0, j([cStrict.ok(), lineS, helpS, cDev.ok(), lineD, lineE, lineM, cDev.win.pushed]));
            const ix = readApp('index.html'), tips = readApp('scripts/tips.js'), tour = readApp('scripts/tutorial.js');
            const row = ix.slice(ix.indexOf('id="setDevConsoleState"') - 200, ix.indexOf('id="setResetLayoutBtn"'));
            const devHelp = ix.slice(ix.indexOf('id="helpDevMode"')).slice(0, 12000).replace(/<svg class="ico"[^>]*>[\s\S]*?<\/svg>/g, '{ico}');   // Help's entry, with a drawing counted as one word: its windows are in characters
            check('Developer mode in words (the page, Help, the tour, the tip): the switch in Settings \u25b8 Advanced is called Developer mode and its line says what it unlocks (~ for the console, Ctrl+Shift+I for the developer tools in the installed app) and that it is off by default; its ids and its stored key are the old ones, so an install that had it on keeps it on; Help and the tour\'s Settings step name it; nothing a user reads calls the switch a "Developer console" any more; the console\'s own read of the key is unchanged',
                />Developer mode <span id="setDevConsoleState"/.test(row) && /<button class="tool ghost" id="setDevConsoleBtn"[^>]*>Toggle Developer mode<\/button>/.test(row) && /<b>~<\/b>/.test(row) && /Ctrl\+Shift\+I/.test(row) && /Off by default/.test(row) && !/Developer console/i.test(row)
                && /Waypoint reloads when you switch it/.test(row) && /Switching it on or off reloads Waypoint, so it cannot be switched during a multiplayer session\./.test(devHelp.slice(0, 1600))
                && /id="helpDevMode"/.test(ix) && /<b>Developer mode<\/b>/.test(devHelp.slice(0, 1200)) && /<kbd>Ctrl \+ Shift \+ I<\/kbd>/.test(devHelp.slice(0, 1200)) && /<kbd>~<\/kbd>/.test(devHelp.slice(0, 1200)) && /never because someone asked you to/.test(devHelp.slice(0, 1200))
                && /<b>Developer mode<\/b>/.test(tour) && /Developer mode/.test(tips) && !/developer console/i.test(tips)
                && /function enabled\(\) \{ try \{ return localStorage\.getItem\('wp_devconsole'\) === 'on'; \} catch \(e\) \{ return false; \} \}/.test(dcSrc) && /dcState\.textContent = localStorage\.getItem\('wp_devconsole'\) === 'on' \? 'on' : 'off';/.test(stSrc));
        }
    }

    {   // the zip fold: an upload is written whole or not at all (servefile.saveUpload, on a real server over a scratch folder)
        const dirU = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-upload-')), net = require('net');
        const srvU = http.createServer((req, res) => { const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname.slice(1)); sf.saveUpload(req, res, path.join(dirU, name), JSON.stringify({ url: '/saves/' + name })); });
        await new Promise(r => srvU.listen(0, '127.0.0.1', r)); srvU.unref();
        const portU = srvU.address().port;
        const post = (p, body) => new Promise(resolve => {
            const rq = http.request({ host: '127.0.0.1', port: portU, path: '/' + p, method: 'POST', headers: { 'Content-Length': body.length }, timeout: 5000 }, rs => { let d = ''; rs.on('data', c => { d += c; }); rs.on('end', () => resolve({ status: rs.statusCode, body: d })); });
            rq.on('error', e => resolve({ err: e.message })); rq.on('timeout', () => { rq.destroy(); resolve({ err: 'timeout' }); }); rq.end(body);
        });
        // a request that says 5,000 bytes, sends 1,000 and is cut
        const cut = p => new Promise(resolve => {
            const so = net.connect(portU, '127.0.0.1', () => { so.write('POST /' + p + ' HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 5000\r\n\r\n'); so.write(Buffer.alloc(1000, 9), () => setTimeout(() => { so.destroy(); setTimeout(resolve, 150); }, 60)); });
            so.on('error', () => resolve());
        });
        const ls = () => fs.readdirSync(dirU).sort().join();
        try {
            const good = Buffer.alloc(5000, 7), newer = Buffer.alloc(3000, 5);
            const r1 = await post('clip.mp4', good), after1 = [ls(), fs.readFileSync(path.join(dirU, 'clip.mp4')).equals(good)];
            await cut('clip.mp4'); const afterCut = [ls(), fs.readFileSync(path.join(dirU, 'clip.mp4')).equals(good)];
            await cut('fresh.mp4'); const afterCutNew = ls();
            const r2 = await post('clip.mp4', newer), after2 = [ls(), fs.readFileSync(path.join(dirU, 'clip.mp4')).equals(newer)];
            const r3 = await post('empty.mp4', Buffer.alloc(0)), after3 = fs.statSync(path.join(dirU, 'empty.mp4')).size;
            fs.mkdirSync(path.join(dirU, 'taken.mp4')); const r4 = await post('taken.mp4', good);   // the place is a folder: the move fails
            const r5 = await post('nowhere/x.mp4', good);                                             // the folder is not there: the write fails
            check('an upload is written whole or not at all (servefile.saveUpload, run for real): a complete one lands with its bytes and answers 200 with its address, a later complete one replaces it, an empty one is an empty file; one cut short (5,000 bytes promised, 1,000 sent) leaves a good copy already there untouched, makes no file where there was none, and leaves no .part behind; a move or a write that fails answers 500 and leaves nothing',
                r1.status === 200 && r1.body === '{"url":"/saves/clip.mp4"}' && j(after1) === j(['clip.mp4', true]) && j(afterCut) === j(['clip.mp4', true]) && afterCutNew === 'clip.mp4' && r2.status === 200 && j(after2) === j(['clip.mp4', true])
                && r3.status === 200 && after3 === 0 && r4.status === 500 && r5.status === 500 && ls() === 'clip.mp4,empty.mp4,taken.mp4' && fs.readdirSync(path.join(dirU, 'taken.mp4')).length === 0, j([r1, after1, afterCut, afterCutNew, r2.status, after2, r3.status, r4, r5, ls()]));
            // a request that closes with neither its end nor an error (how some runtimes report a cut), and one that errors after its last byte
            const { PassThrough } = require('stream');
            const fake = (name, len, complete, after) => new Promise(resolve => {
                const rq = new PassThrough(); rq.headers = { 'content-length': String(len) }; rq.complete = complete;
                const t = setTimeout(() => resolve('no answer'), 1500), rs = { code: 0, writeHead(c) { this.code = c; }, end() { clearTimeout(t); resolve(this.code); } };
                sf.saveUpload(rq, rs, path.join(dirU, name), '{}');
                rq.write(Buffer.alloc(4, 1)); setTimeout(() => after(rq), 80);
            });
            const closedR = await fake('closed.mp4', 9, false, rq => rq.destroy()), erroredR = await fake('errored.mp4', 4, true, rq => rq.emit('error', new Error('reset')));
            check('a request that just closes, incomplete, is a cut one (answered 500, nothing left); one that reports an error is never moved into place, even with every promised byte written',
                closedR === 500 && erroredR === 500 && ls() === 'clip.mp4,empty.mp4,taken.mp4', j([closedR, erroredR, ls()]));
        } finally {
            srvU.close();
            try { fs.rmSync(dirU, { recursive: true, force: true }); } catch (e) {}
        }
        const upBoth = s => (s.match(/servefile\.saveUpload\(req, res, savePath, /g) || []).length === 2 && !/fs\.createWriteStream\(savePath\)/.test(s) && /server\.requestTimeout = 0;/.test(s)
            && /let rel = relRaw; try \{ rel = decodeURIComponent\(relRaw\); \} catch \(e\) \{ rel = relRaw; \}/.test(s) && !/const rel = decodeURIComponent\(url\.searchParams\.get\('path'\)/.test(s);
        check('the shell and the dev server write both kinds of upload (a new file into the library, an import copying a file back to its place) through saveUpload, never straight onto the final path; a request may take as long as a large file needs (no five-minute cut); a name with a bare % is taken as it is, never an exception that leaves the request unanswered',
            upBoth(main) && upBoth(dev));
    }

    {   // the security pass of 2026-10-01: an import copying a file back never replaces one already there (servefile.saveUpload with keep, run for real)
        const dirK = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-keep-'));
        const srvK = http.createServer((req, res) => { const u = new URL(req.url, 'http://localhost'), name = decodeURIComponent(u.pathname.slice(1)); sf.saveUpload(req, res, path.join(dirK, name), JSON.stringify({ url: '/saves/' + name }), { keep: u.searchParams.get('keep') === '1' }); });
        await new Promise(r => srvK.listen(0, '127.0.0.1', r)); srvK.unref();
        const portK = srvK.address().port;
        const postK = (p, body, port) => new Promise(resolve => {
            const rq = http.request({ host: '127.0.0.1', port: port || portK, path: '/' + p, method: 'POST', headers: { 'Content-Length': body.length }, timeout: 5000 }, rs => { let d = ''; rs.on('data', c => { d += c; }); rs.on('end', () => resolve({ status: rs.statusCode, body: d })); });
            rq.on('error', e => resolve({ err: e.message })); rq.on('timeout', () => { rq.destroy(); resolve({ err: 'timeout' }); }); rq.end(body);
        });
        const lsK = () => fs.readdirSync(dirK).sort().join(), readK = n => fs.readFileSync(path.join(dirK, n));
        const realLink = fs.linkSync;
        try {
            const had = Buffer.from('{"entries":[{"text":"a player\'s own notes"}]}'), mine = Buffer.alloc(300, 3), other = Buffer.alloc(10, 4);
            fs.writeFileSync(path.join(dirK, 'journal.json'), had);
            const k1 = await postK('journal.json?keep=1', mine), a1 = [lsK(), readK('journal.json').equals(had)];                   // over a file already there: refused, the file kept
            const k2 = await postK('fresh.png?keep=1', mine), a2 = [lsK(), readK('fresh.png').equals(mine)];                          // where there was none: written whole
            const k3 = await postK('fresh.png?keep=1', other), a3 = readK('fresh.png').equals(mine);                                   // the same name again (an archive holding a file twice, or an export imported twice): kept
            fs.linkSync = () => { const e = new Error('no hard links here'); e.code = 'EPERM'; throw e; };                             // a saves folder on a filesystem without hard links (a memory stick): the exclusive copy instead
            const k4 = await postK('journal.json?keep=1', mine), a4 = readK('journal.json').equals(had);
            const k5 = await postK('copied.png?keep=1', mine), a5 = [lsK(), readK('copied.png').equals(mine)];
            fs.linkSync = realLink;
            const k6 = await postK('journal.json', mine), a6 = readK('journal.json').equals(mine);                                     // without keep (the Journal's own saves, a new picture): replaced in place, as ever
            check('an import never replaces a file already there (servefile.saveUpload with keep, run for real): over a file that exists it answers 409 and the file keeps its bytes, where there is none the upload is written whole and answers 200, the same name a second time is kept, no .part is left either way; on a filesystem without hard links the exclusive copy gives the same answers; without keep a file is replaced in place as before',
                k1.status === 409 && j(a1) === j(['journal.json', true]) && k2.status === 200 && k2.body === '{"url":"/saves/fresh.png"}' && j(a2) === j(['fresh.png,journal.json', true]) && k3.status === 409 && a3 === true
                && k4.status === 409 && a4 === true && k5.status === 200 && j(a5) === j(['copied.png,fresh.png,journal.json', true]) && k6.status === 200 && a6 === true && lsK() === 'copied.png,fresh.png,journal.json',
                j([k1, a1, k2, a2, k3, a3, k4, a4, k5, a5, k6, a6, lsK()]));
        } finally {
            fs.linkSync = realLink;
            srvK.close();
            try { fs.rmSync(dirK, { recursive: true, force: true }); } catch (e) {}
        }
        // the dev server itself (tools/dev-server.js on a scratch saves folder, as a child process): upload-exact with keep=1 over a picture already there
        const savesK = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-devkeep-')), pic = path.join(savesK, 'images', 'm_abc', 'x1_pic.png'), was = Buffer.from('the GM\'s own picture');
        fs.mkdirSync(path.dirname(pic), { recursive: true }); fs.writeFileSync(pic, was);
        const freePort = await new Promise(r => { const s = http.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
        const child = require('child_process').spawn(process.execPath, [path.join(__dirname, 'dev-server.js'), savesK, String(freePort)], { stdio: ['ignore', 'pipe', 'pipe'] });
        const started = await new Promise(resolve => { let out = ''; const t = setTimeout(() => resolve(false), 15000); child.stdout.on('data', c => { out += c; if (/Waypoint dev server/.test(out)) { clearTimeout(t); resolve(true); } }); child.on('exit', () => { clearTimeout(t); resolve(false); }); });
        try {
            const d1 = started ? await postK('api/upload-exact?keep=1&path=' + encodeURIComponent('images/m_abc/x1_pic.png'), Buffer.alloc(40, 9), freePort) : { err: 'the dev server did not start' };
            const d1k = fs.readFileSync(pic).equals(was), partsD = fs.readdirSync(path.dirname(pic)).filter(f => /\.part$/.test(f)).length;
            const d2 = started ? await postK('api/upload-exact?keep=1&path=' + encodeURIComponent('images/m_abc/x2_new.png'), Buffer.alloc(40, 9), freePort) : { err: 'the dev server did not start' };
            const d2k = fs.existsSync(path.join(savesK, 'images', 'm_abc', 'x2_new.png')) && fs.readFileSync(path.join(savesK, 'images', 'm_abc', 'x2_new.png')).equals(Buffer.alloc(40, 9));
            const d3 = started ? await postK('api/upload-exact?path=' + encodeURIComponent('images/m_abc/x1_pic.png'), Buffer.alloc(40, 9), freePort) : { err: 'the dev server did not start' };
            const d3k = fs.readFileSync(pic).equals(Buffer.alloc(40, 9));
            check('the dev server run for real on a scratch saves folder: upload-exact with keep=1 over a picture already there answers 409 and leaves it as it was, no .part beside it; a new name is written; without keep the file is replaced as before',
                started && d1.status === 409 && d1k && partsD === 0 && d2.status === 200 && d2k && d3.status === 200 && d3k, j([started, d1, d1k, partsD, d2, d2k, d3, d3k]));
        } finally {
            try { child.kill(); } catch (e) {}
            await new Promise(r => { const t = setTimeout(r, 2000); child.on('exit', () => { clearTimeout(t); r(); }); if (child.exitCode !== null) { clearTimeout(t); r(); } });
            try { fs.rmSync(savesK, { recursive: true, force: true }); } catch (e) {}
        }
        const keepBoth = s => { const b = s.slice(s.indexOf("if (url.pathname === '/api/upload-exact' && req.method === 'POST') {"), s.indexOf("if (url.pathname === '/api/upload' && req.method === 'POST') {")); return b.length > 200 && /const keep = url\.searchParams\.get\('keep'\) === '1'/.test(b) && /servefile\.saveUpload\(req, res, savePath, JSON\.stringify\(\{ url: '\/saves\/' \+ segs\.join\('\/'\) \}\), \{ keep: keep, max: reqguard\.UPLOAD_MAX\[kind\] \}\);/.test(b); };
        const keepOnlyExact = s => (s.match(/url\.searchParams\.get\('keep'\)/g) || []).length === 1 && (s.match(/keep: keep/g) || []).length === 1;
        check('the shell and the dev server hand upload-exact\'s keep flag to saveUpload (and only there: a new file into the library is named afresh each time); the import\'s copies (main.js) ask for it on every file, the Journal\'s, a portrait\'s and the tutorial\'s own saves do not',
            keepBoth(main) && keepBoth(dev) && keepOnlyExact(main) && keepOnlyExact(dev)
            && /fetch\('\/api\/upload-exact\?keep=1&path=' \+ encodeURIComponent\(relPath\), \{ method: 'POST', body: body \}\)/.test(fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'main.js'), 'utf8'))
            && ['handouts.js', 'sheets.js', 'tutorial.js'].every(f => { const s = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', f), 'utf8'); return /upload-exact\?path=/.test(s) && !/keep=1/.test(s); }));
    }

    {   // the outside audit of 2026-10-01 (cluster V): what the local server takes and refuses. The rules live in reqguard.js and are run for
        // real here; then the dev server as a child process on scratch saves; then the shell's own request handling (main.js, from its
        // LOCAL_HOSTS line to the server's timeout line, with Electron's parts as recording stubs) mounted on a scratch saves folder
        let rg = null; try { rg = require('../system/resources/app/reqguard.js'); } catch (e) { rg = null; }
        const has = n => !!rg && typeof rg[n] === 'function';
        const MBv = 1024 * 1024;
        // one request: body a string or Buffer (sent whole with its length), an array of Buffers (sent chunked, no length), or null with a
        // Content-Length header (the size stated, the bytes never sent)
        const hit = (port, method, p, body, headers) => new Promise(resolve => {
            const h = Object.assign({}, headers || {}); let settled = false;
            if (body !== null && body !== undefined && !Array.isArray(body)) h['Content-Length'] = Buffer.byteLength(body);
            const rq = http.request({ host: '127.0.0.1', port, path: p, method, headers: h, agent: false }, rs => { const bufs = []; rs.on('data', c => bufs.push(c)); const fin = () => { if (settled) return; settled = true; resolve({ status: rs.statusCode, h: rs.headers, body: Buffer.concat(bufs).toString('utf8') }); if (body === null) rq.destroy(); }; rs.on('end', fin); rs.on('error', fin); rs.on('close', fin); });
            rq.on('error', e => { if (settled) return; settled = true; resolve({ status: 0, err: String(e && e.code) }); });
            rq.setTimeout(15000, () => { const e = new Error('no answer'); e.code = 'ETIMEDOUT'; rq.destroy(e); });
            if (body === null) { rq.flushHeaders(); return; }
            if (Array.isArray(body)) { let i = 0; const next = () => { if (i < body.length) { try { rq.write(body[i++]); } catch (e) {} setTimeout(next, 5); } else rq.end(); }; next(); return; }
            if (body !== undefined) rq.write(body); rq.end();
        });
        const walk = dir => { let out = []; let names = []; try { names = fs.readdirSync(dir); } catch (e) { return out; } names.forEach(n => { const f = path.join(dir, n); let st; try { st = fs.statSync(f); } catch (e) { return; } if (st.isDirectory()) { out.push(n + '/'); out = out.concat(walk(f).map(x => n + '/' + x)); } else out.push(n); }); return out; };
        const wait = ms => new Promise(r => setTimeout(r, ms));
        const rdF = f => { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return null; } }, szF = f => { try { return fs.statSync(f).size; } catch (e) { return -1; } }, lsF = d => { try { return fs.readdirSync(d).sort(); } catch (e) { return []; } };   // a file that is not there fails its check, it does not stop the suite

        /* ---- names ---- */
        const badNames = ['x.scf', 'x.library-ms', 'x.searchConnector-ms', 'x.wsf', 'x.jse', 'x.vbe', 'x.wsh', 'x.sct', 'x.reg', 'x.cpl', 'x.msc', 'x.chm', 'x.appref-ms', 'x.application', 'x.py', 'x.sh', 'x.iso', 'x.docm', 'x.pdf', 'x.shtml', 'x.json', 'journal.json', 'desktop.ini', '.hidden', '.png', '.x.mp4', 'noext', 'x.exe.', 'x.exe ', 'x.png.', 'x.png ', 'x.png.exe', 'x.png.wsf', 'x.html', 'x.lnk', 'x.js', 'x.exe', '', 'NUL', 'nul.png', 'CON.png', 'com1.jpg', 'LPT9.gif', 'a/b.png', 'a\\b.png', 'a:b.png', 'a..b.png', 'tab\there.png', 'x'.repeat(197) + '.png', null, 5];
        const goodNames = ['bren_hex.png', 'map_inn.jpg', 'a.b.c.JPEG', 'Aria - token.png', 'x.svg', 'x.webp', 'x.gif', 'x.jfif', 'x.avif', 'x.bmp', 'x.ico', 'x.apng', 'console.png', 'nulls.png', 'x'.repeat(196) + '.png'].concat(Object.keys(sf.MEDIA).map(e => 'clip' + e), Object.keys(sf.MEDIA).map(e => 'CLIP' + e.toUpperCase()));
        check('cluster V (names): a file name the server takes is a picture, a sound or a video by the app\'s own list — the picture types the app shows and every type the server has a media type for, in either case — and nothing else: no script, shortcut, library or settings file, no page, no .json, no name without an extension, none beginning with a dot or ending in a dot or a space (the old refusal list was walked past by "x.exe."), no Windows device name (NUL, CON.png), no separator, walk or control character, none past 200 characters',
            has('safeFileName') && badNames.filter(n => rg.safeFileName(n) !== false).length === 0 && goodNames.filter(n => rg.safeFileName(n) !== true).length === 0, rg ? j([badNames.filter(n => rg.safeFileName(n) !== false), goodNames.filter(n => rg.safeFileName(n) !== true)]) : 'no reqguard.js');
        const badSegs = ['', '.', '..', 'a..b', 'dir.', 'dir ', 'NUL', 'COM1', 'aux', 'con.txt', 'a/b', 'a\\b', 'a:b', 'a*b', 'a?b', 'a"b', 'a<b', 'a>b', 'a|b', 'a' + String.fromCharCode(0) + 'b', 'a' + String.fromCharCode(31) + 'b', 'x'.repeat(201), null], goodSegs = ['m_abc', 'portraits', 'camp1__u_gm', 'My Map (2)', 'a.b', '{x}', 'x'.repeat(200), 'consul', 'com10'];
        const badIds = ['NUL', 'audio/COM1', 'm_b.', 'a/b/c', '../x', 'a b', '', 'audio/', 5], goodIds = ['m_abc', 'audio/c_1', 'video/camp-1', 'unknown', 'journal/c1'];
        check('cluster V (names): a path segment is plain — no separator, walk or control character, no trailing dot or space, no device name, at most 200 characters — and a map id is one or two such segments of letters, digits, _ . -',
            has('safeSeg') && has('safeMapId') && badSegs.every(s => rg.safeSeg(s) === false) && goodSegs.every(s => rg.safeSeg(s) === true) && badIds.every(s => rg.safeMapId(s) === false) && goodIds.every(s => rg.safeMapId(s) === true), rg ? j([badSegs.filter(s => rg.safeSeg(s)), goodSegs.filter(s => !rg.safeSeg(s)), badIds.filter(s => rg.safeMapId(s)), goodIds.filter(s => !rg.safeMapId(s))]) : '');
        const K = (p, keep) => (has('exactKind') ? rg.exactKind(p.split('/'), keep) : 'none');
        const kinds = { picture: ['images/m_a/ok.png', 'images/m_a/a.svg', 'images/journal/c_abc/h_1.webp', 'images/portraits/portrait-ch_1-m1.png', 'images/tutorial/x_sq.jpg', 'images/a/b/c/d/e.png'],
            sound: ['images/audio/c_1/ab_song one.mp3', 'images/audio/c_1/x.webm', 'images/m_a/x.mp4', 'images/video/c_1/x.mp3'], video: ['images/video/c_1/ab_intro.mp4', 'images/video/c_1/x.webm', 'images/video/c_1/x.MOV'], index: ['images/journal/journals.json', 'images/journal/c_abc/journal.json', 'images/journal/personal/journal.json'] };
        const noKind = ['images/m_a/a.json', 'images/m_a/journal.json', 'images/journal/c/other.json', 'images/journal/c/d/journal.json', 'images/Journal/journals.json', 'images/journal/journal.json', 'images/journal/c d/journal.json', 'images/desktop.ini', 'images/m_a/payload.scf', 'images/m_a/run.wsf', 'images/m_a/NUL', 'images/m_a/CON.png', 'images/m_a/pic.png.', 'images/m_a/trail.png ', 'images/m_a/x.exe.', 'images/m_a/x.html.', 'images/dir./in.png', 'images/COM1/in.png', 'images/a/b/c/d/e/f.png', 'data.json', 'library/x.png', 'images', 'images/m_a/.hidden.png', 'images/m_a/../x.png'];
        check('cluster V (uploads): the kind of file a path under saves/ would be, by the app\'s own list — a picture; a sound; a video only in the video folder (a video file anywhere else is held to a sound\'s size); the Journal\'s registry and a journal\'s index at their own two places and nowhere else — and anything the app does not write is no kind at all: a .json anywhere else, a script or shortcut type, a device name, a trailing dot or space in the name or a folder, a seventh segment, a path outside images/',
            Object.keys(kinds).every(k => kinds[k].every(p => K(p, false) === k)) && noKind.every(p => K(p, false) === null), j([Object.keys(kinds).map(k => kinds[k].map(p => K(p, false))), noKind.filter(p => K(p, false) !== null)]));
        check('cluster V (uploads): an import\'s copy (keep) never lands in the Journal\'s folder, in any spelling of its name the disk would read as it — a picture, a journal\'s index, the registry — while the Journal\'s own writes (no keep) and a folder whose name merely begins with journal are taken as before',
            ['images/journal/k/a.png', 'images/Journal/k/a.png', 'images/JOURNAL/k/journal.json', 'images/journal/k/journal.json', 'images/journal/journals.json'].every(p => K(p, true) === null) && K('images/journalx/y.png', true) === 'picture' && K('images/journal/k/a.png', false) === 'picture' && K('images/journal/k/journal.json', false) === 'index' && K('images/m_abc/x.png', true) === 'picture',
            j(['images/journal/k/a.png', 'images/Journal/k/a.png', 'images/journalx/y.png'].map(p => K(p, true))));
        const F = (m, n) => (has('freshKind') ? rg.freshKind(m, n) : 'none');
        check('cluster V (uploads): a new file into a folder is a picture, a sound or a video under a plain map id — never an index, never into a folder Windows reads as a device or one ending in a dot; and each kind has a size no honest file reaches (a picture 256 MB, a sound 64 MB, an index 64 MB), a video none',
            F('m_b', 'picture.png') === 'picture' && F('audio/c1', 's.mp3') === 'sound' && F('video/c1', 'v.mp4') === 'video' && F('journal/c1', 'journal.json') === null && F('journal', 'journals.json') === null && F('NUL', 'a.png') === null && F('audio/COM1', 'a.png') === null && F('m_b.', 'a.png') === null && F('m_b', 'p.scf') === null && F('m_b', 'p.png.') === null && F('m_b', 'desktop.ini') === null && F('m_b', 'NUL') === null
            && !!rg && j(rg.UPLOAD_MAX) === j({ picture: 256 * MBv, sound: 64 * MBv, index: 64 * MBv, video: null }) && rg.UPLOAD_MAX.video === Infinity && Object.isFrozen(rg.UPLOAD_MAX), rg ? j(rg.UPLOAD_MAX) : '');

        /* ---- an upload's size: servefile.saveUpload with max, on a real server ---- */
        {
            const dirM = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-max-'));
            const srvM = http.createServer((req, res) => { const u = new URL(req.url, 'http://localhost'), name = decodeURIComponent(u.pathname.slice(1)); const m = u.searchParams.get('max'); sf.saveUpload(req, res, path.join(dirM, name), '{}', { max: m === null ? undefined : m === 'inf' ? Infinity : Number(m), keep: u.searchParams.get('keep') === '1' }); });
            await new Promise(r => srvM.listen(0, '127.0.0.1', r)); srvM.unref();
            const pM = srvM.address().port, lsM = () => fs.readdirSync(dirM).sort().join();
            try {
                const at = await hit(pM, 'POST', '/at.png?max=1000', Buffer.alloc(1000, 1)), over = await hit(pM, 'POST', '/over.png?max=1000', Buffer.alloc(1001, 1));
                const stated = await hit(pM, 'POST', '/stated.png?max=1000', null, { 'Content-Length': 5000 });
                const chunked = await hit(pM, 'POST', '/chunked.png?max=1000', [Buffer.alloc(600, 2), Buffer.alloc(600, 2), Buffer.alloc(600, 2)], { 'Transfer-Encoding': 'chunked' });
                fs.writeFileSync(path.join(dirM, 'mine.png'), 'the file that was here');
                const overMine = await hit(pM, 'POST', '/mine.png?max=1000', Buffer.alloc(1001, 1)), overKeep = await hit(pM, 'POST', '/mine.png?max=1000&keep=1', null, { 'Content-Length': 5000 });
                const free = await hit(pM, 'POST', '/free.mp4', Buffer.alloc(5000, 3)), inf = await hit(pM, 'POST', '/inf.mp4?max=inf', Buffer.alloc(5000, 3));
                await wait(150);
                check('cluster V (uploads, servefile.saveUpload with max, run for real): a file as large as its kind allows lands whole; one byte more is refused 413 with nothing written — when its length says so before a byte is read, and when it only keeps coming (no stated length) — and a file already there keeps its bytes; no .part is left; with no size given, or none at all (a video), any size lands as before',
                    at.status === 200 && fs.statSync(path.join(dirM, 'at.png')).size === 1000 && over.status === 413 && stated.status === 413 && (chunked.status === 413 || chunked.status === 0) && overMine.status === 413 && overKeep.status === 413 && fs.readFileSync(path.join(dirM, 'mine.png'), 'utf8') === 'the file that was here'
                    && free.status === 200 && inf.status === 200 && lsM() === 'at.png,free.mp4,inf.mp4,mine.png', j([at.status, over.status, stated.status, chunked.status, overMine.status, overKeep.status, free.status, inf.status, lsM()]));
            } finally { srvM.close(); try { fs.rmSync(dirM, { recursive: true, force: true }); } catch (e) {} }
        }

        /* ---- a request body, bounded: reqguard.readBody on a real server and on a request of plain objects ---- */
        {
            const gotB = [];
            const srvB = http.createServer((req, res) => { if (!has('readBody')) { res.writeHead(501); return res.end(); } rg.readBody(req, res, 1000, body => { if (body === 'throw') throw new Error('the handler failed'); gotB.push(body); res.writeHead(200); res.end(String(Buffer.byteLength(body))); }); });
            await new Promise(r => srvB.listen(0, '127.0.0.1', r)); srvB.unref();
            const pB = srvB.address().port;
            try {
                const text = 'a'.repeat(990) + '—😀' + 'bcd', tb = Buffer.from(text, 'utf8'), c1 = tb.indexOf(Buffer.from('—', 'utf8')) + 1, c2 = tb.indexOf(Buffer.from('😀', 'utf8')) + 2;   // exactly 1000 bytes, an em dash and an emoji each split between two chunks
                const whole = await hit(pB, 'POST', '/', [tb.slice(0, c1), tb.slice(c1, c2), tb.slice(c2)], { 'Transfer-Encoding': 'chunked' }), gotWhole = gotB.slice();
                const stated = await hit(pB, 'POST', '/', null, { 'Content-Length': 1001 }), n1 = gotB.length;
                const sent = await hit(pB, 'POST', '/', Buffer.alloc(1001, 97)), n2 = gotB.length;
                const chunked = await hit(pB, 'POST', '/', [Buffer.alloc(600, 97), Buffer.alloc(600, 97), Buffer.alloc(600, 97)], { 'Transfer-Encoding': 'chunked' }), n3 = gotB.length;
                const threw = await hit(pB, 'POST', '/', 'throw'), empty = await hit(pB, 'POST', '/', '');
                const { PassThrough } = require('stream'), rq = new PassThrough(); rq.headers = {}; const seen = [], rs = { code: 0, headersSent: false, writeHead(c, h) { this.code = c; this.h = h; this.headersSent = true; }, end() {} };
                if (has('readBody')) rg.readBody(rq, rs, 10, b => seen.push(b));
                rq.write('123456'); await wait(10); rq.write('7890ab'); await wait(10); rq.write('more and more'); rq.end(); await wait(30);
                check('cluster V (bodies, reqguard.readBody run for real): a body as large as its cap arrives whole, a character split between two chunks intact; one byte more answers 413 with Connection: close and the handler never runs — whether its length said so up front (before a byte is kept), it was sent whole, or it only kept coming; what comes after is dropped, never kept; a handler that throws is answered 500, never left without an answer; an empty body is an empty text',
                    tb.length === 1000 && whole.status === 200 && whole.body === '1000' && gotWhole.length === 1 && gotWhole[0] === text && stated.status === 413 && stated.h.connection === 'close' && n1 === 1 && (sent.status === 413 || sent.status === 0) && n2 === 1 && (chunked.status === 413 || chunked.status === 0) && n3 === 1
                    && threw.status === 500 && empty.status === 200 && empty.body === '0' && rs.code === 413 && seen.length === 0 && !!rg && j(rg.BODY) === j({ small: 64 * 1024, prefs: 2 * MBv, data: 512 * MBv }), j([whole.status, whole.body, gotWhole.length, stated.status, stated.h && stated.h.connection, sent.status, chunked.status, [n1, n2, n3], threw.status, empty.status, rs.code, seen.length]));
            } finally { srvB.close(); }
        }

        /* ---- the error log, bounded ---- */
        {
            const dirL = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-log-')), logF = path.join(dirL, 'error.log');
            try {
                let threwL = false, small = '', afterLong = 0, rotated = [], twice = [];
                if (has('appendLog')) {
                    rg.appendLog(dirL, 'first line'); small = rdF(logF) || '';
                    rg.appendLog(dirL, 'y'.repeat(MBv)); afterLong = szF(logF) - Buffer.byteLength(small);
                    fs.writeFileSync(logF, Buffer.alloc(rg.LOG_ROTATE + 1, 65)); rg.appendLog(dirL, 'after the move');
                    rotated = [szF(logF + '.1'), szF(logF) < 1000 ? rdF(logF) : 'the log was not moved aside'];
                    fs.writeFileSync(logF, Buffer.alloc(rg.LOG_ROTATE + 5, 66)); rg.appendLog(dirL, 'again');
                    twice = [szF(logF + '.1'), (rdF(logF + '.1') || '').slice(0, 1), lsF(dirL).join()];
                    fs.rmSync(logF); fs.mkdirSync(logF); try { rg.appendLog(dirL, 'no room'); } catch (e) { threwL = true; }
                }
                check('cluster V (the log, reqguard.appendLog run for real): a line is appended with its time; a line of 1 MB is stored as at most 64 KB; a log past 4 MB is moved to error.log.1 before the next line (one older file kept, the one before it replaced), so the two together stay bounded; an append the disk refuses throws, for the caller to answer',
                    /^\d{4}-\d\d-\d\dT[^ ]+: first line\n$/.test(small) && afterLong > 60 * 1024 && afterLong <= 64 * 1024 + 64 && rotated[0] === 4 * MBv + 1 && /^\S+: after the move\n$/.test(rotated[1] || '') && twice[0] === 4 * MBv + 5 && twice[1] === 'B' && twice[2] === 'error.log,error.log.1' && threwL && rg.LOG_LINE === 64 * 1024 && rg.LOG_ROTATE === 4 * MBv,
                    j([small, afterLong, rotated[0], (rotated[1] || '').slice(0, 60), twice, threwL]));
            } finally { try { fs.rmSync(dirL, { recursive: true, force: true }); } catch (e) {} }
        }

        /* ---- the launch secret ---- */
        {
            const S = has('newSecret') ? rg.newSecret() : '', S2 = has('newSecret') ? rg.newSecret() : '', rq = v => ({ headers: v === undefined ? {} : { 'x-waypoint-launch': v } });
            const L = (v, s) => (has('launchOk') ? rg.launchOk(rq(v), s === undefined ? S : s) : 'none');
            const wrong = S.replace(/.$/, c => (c === '0' ? '1' : '0'));
            check('cluster V (the launch secret, reqguard.launchOk run for real): a secret is 32 random bytes as 64 hex characters, new each time; a request passes only with exactly it in its header — none, a wrong value of the same length, a shorter or longer one, a list of values or a number is refused, never an exception — and a secret that is none (empty, short, not a text) passes nothing, even a request that names the same',
                /^[0-9a-f]{64}$/.test(S) && /^[0-9a-f]{64}$/.test(S2) && S !== S2 && L(S) === true && L(undefined) === false && L(wrong) === false && wrong.length === S.length && L(S.slice(1)) === false && L(S + '0') === false && L([S]) === false && L(5) === false && L('') === false
                && L('', '') === false && L('short', 'short') === false && L(undefined, undefined) === false && L('x'.repeat(31), 'x'.repeat(31)) === false && L(S, null) === false && (has('launchOk') && rg.launchOk(null, S) === false && rg.launchOk({}, S) === false), j([S.length, L(S), L(undefined), L(wrong), L(S + '0'), L('', '')]));
            // the shell's half, on a recording stand-in for Electron's session
            const rec = { args: null }, ses = { webRequest: { onBeforeSendHeaders() { rec.args = Array.prototype.slice.call(arguments); } } }; let portNow = 4321;
            if (has('sendLaunch')) rg.sendLaunch(ses, () => 'http://localhost:' + portNow, S);
            const listener = rec.args && rec.args.length === 1 && typeof rec.args[0] === 'function' ? rec.args[0] : null;
            const out = (url, hdrs) => { let r = null; if (listener) listener({ url: url, requestHeaders: hdrs || { Accept: '*/*' } }, x => { r = x; }); return r && r.requestHeaders ? r.requestHeaders : null; };
            const mineU = ['http://localhost:4321/', 'http://localhost:4321/api/data', 'http://localhost:4321/saves/images/m/a%20b.png?x=1#y', 'http://localhost:4321'];
            const otherU = ['http://localhost:4322/api/data', 'http://localhost:43210/', 'http://localhost.evil.example:4321/', 'http://127.0.0.1:4321/api/data', 'http://[::1]:4321/', 'https://localhost:4321/', 'http://evil.example/', 'https://github.com/x', 'blob:http://localhost:4321/1b2c', 'ws://localhost:4321/', 'file:///C:/x.html', 'not a url', '', undefined];
            const sentMine = mineU.map(u => out(u)), sentOther = otherU.map(u => out(u));
            const stripped = out('https://evil.example/collect', { Accept: 'x', 'X-Waypoint-Launch': 'a guess', 'x-waypoint-launch': 'another' }), over = out('http://localhost:4321/api/data', { 'X-WAYPOINT-LAUNCH': 'a page\'s own', Referer: 'r' });
            const given = { Accept: 'a' }; out('http://localhost:4321/', given);
            portNow = 4400; const moved = [out('http://localhost:4400/'), out('http://localhost:4321/')];
            check('cluster V (the launch secret, reqguard.sendLaunch on a recording session): the shell adds the secret to every request to the app\'s own origin — exactly that scheme, host and port, as they are at that moment — and to no other address: not another port, a longer port, a host that only begins the same, the same port on 127.0.0.1 or [::1], https, a web site, a blob, a file, or no address at all; a request\'s other headers travel as they were, a header of that name a page set itself never travels anywhere, and the listener judges the address itself (no URL pattern to mismatch)',
                !!listener && sentMine.every(h => h && h['X-Waypoint-Launch'] === S && h.Accept === '*/*' && Object.keys(h).length === 2) && sentOther.every(h => h && Object.keys(h).every(k => k.toLowerCase() !== 'x-waypoint-launch') && h.Accept === '*/*')
                && j(stripped) === j({ Accept: 'x' }) && j(over) === j({ Referer: 'r', 'X-Waypoint-Launch': S }) && j(given) === j({ Accept: 'a' }) && moved[0]['X-Waypoint-Launch'] === S && moved[1]['X-Waypoint-Launch'] === undefined, j([!!listener, sentMine.map(h => h && Object.keys(h)), sentOther.map(h => h && Object.keys(h)), stripped, over && Object.keys(over), moved.map(h => h && Object.keys(h))]));
        }

        /* ---- what may be deleted ---- */
        {
            const D = (p, jn) => (has('deleteTarget') ? rg.deleteTarget(p, jn) : 'none');
            const okD = [['/saves/images/m_abc/pic.png', false, 'images/m_abc/pic.png'], ['images/m_abc/ab12cd34_my..map.png', false, 'images/m_abc/ab12cd34_my..map.png'], ['/saves/images/audio/c1/s.mp3', false, 'images/audio/c1/s.mp3'], ['/saves/images//m_abc//pic.png', undefined, 'images/m_abc/pic.png'],
                ['/saves/images/journal/c1__gm/h_1.png', true, 'images/journal/c1__gm/h_1.png'], ['/saves/images/journal/c1/h-v2.jpg', true, 'images/journal/c1/h-v2.jpg'], ['/saves/images/journal/c1/h.webp', true, 'images/journal/c1/h.webp']];
            const noD = [['/saves/images/journal/c1/journal.json', false], ['/saves/images/journal/c1/journal.json', true], ['/saves/images/journal/journals.json', false], ['/saves/images/journal/journals.json', true], ['images/JOURNAL/journals.json', true], ['images/journal./journals.json', true], ['images/journal /c1/x.png', true],
                ['/saves/images/journal/c1/h_1.png', false], ['/saves/images/journal/c1/h_1.png', 'true'], ['/saves/images/journal/c1/h_1.png', 1], ['/saves/images/Journal/c1/h_1.png', true], ['/saves/images/journal/c1/sub/h.png', true], ['/saves/images/journal/c1/h.gif', true], ['/saves/images/journal/c1/h.png.', true], ['/saves/images/journal/c 1/h.png', true], ['/saves/images/journal/h.png', true],
                ['images/.. /data.json', false], ['images/.../data.json', false], ['images/m_abc/.. /.. /data.json', false], ['images/../data.json', false], ['images/./x.png', false], ['images/ /x.png', false], ['data.json', false], ['images', false], ['/saves/data.json', false], ['images/a\\b.png', false], ['images/a:b', false], ['images/m/a' + String.fromCharCode(0) + '.png', false], ['images/m/' + 'x'.repeat(201), false], ['backups/data-x.json', false], [5, false], [null, true], [undefined, false]];
            check('cluster V (delete, reqguard.deleteTarget run for real): a picture or a sound under saves/images may be deleted, a legacy name with dots inside it too; never a file of the Journal\'s by the Image Library\'s word, in any spelling of the folder — and by the Journal\'s own word (journal exactly true) only a page\'s picture at its own place, never a journal\'s index nor the registry; never a segment of only dots and spaces, a backslash, a colon, a control character, a path outside images/',
                okD.every(c => j(D(c[0], c[1])) === j(c[2].split('/'))) && noD.every(c => D(c[0], c[1]) === null), j([okD.filter(c => j(D(c[0], c[1])) !== j(c[2].split('/'))).map(c => c[0]), noD.filter(c => D(c[0], c[1]) !== null).map(c => c[0])]));
        }

        /* ---- backups: a launch backup is moved aside, never erased ---- */
        {
            const savesB = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-bk-')), bkB = path.join(savesB, 'backups'), libDir = path.join(savesB, 'library', 'l_abcd1234');
            try {
                fs.mkdirSync(bkB, { recursive: true }); fs.mkdirSync(libDir, { recursive: true }); fs.writeFileSync(path.join(libDir, 'p_gear.1.json'), '{"format":"waypoint-pack","v":1,"id":"p_gear","rev":1,"entries":[]}');
                const mk = n => { fs.writeFileSync(path.join(bkB, n + '.json'), '{"name":"' + n + '"}'); lib.snapshot(savesB, bkB, n); };
                mk('data-2026-10-01-10-00-00'); mk('keep-2026-10-01-10-30-00'); mk('data-2026-10-01-11-00-00');
                const R = f => (has('removeBackup') ? rg.removeBackup(bkB, f, lib) : 'none');
                const r1 = R('data-2026-10-01-10-00-00.json'), a1 = walk(bkB).sort();
                const r2 = R('keep-2026-10-01-10-30-00.json'), a2 = walk(bkB).sort();
                const rBad = [R('removed/data-2026-10-01-10-00-00.json'), R('../data.json'), R('data-x.json/..'), R('lib-data-2026-10-01-11-00-00'), R(5), R('data-nope.json')];
                const listed = fs.readdirSync(bkB).filter(f => /^(data|keep)-[A-Za-z0-9_-]+\.json$/.test(f));
                fs.writeFileSync(path.join(bkB, 'data-2026-10-01-10-00-00.json'), '{"again":1}'); const r3 = R('data-2026-10-01-10-00-00.json'), again = rdF(path.join(bkB, 'removed', 'data-2026-10-01-10-00-00.json'));   // the same name set aside a second time: the newer copy stands
                check('cluster V (backups, reqguard.removeBackup run for real with the real library store): deleting a launch backup (data-…) moves it and its library files into backups/removed — its bytes kept, no longer among the snapshots the API lists, restores or deletes — while a snapshot taken by hand (keep-…) goes with its library files, as asked; a name inside removed/, a path, a library folder\'s name or anything that is no snapshot\'s name is refused, and one that is not there is said to be missing',
                    r1 === 'moved' && a1.indexOf('removed/data-2026-10-01-10-00-00.json') >= 0 && a1.indexOf('removed/lib-data-2026-10-01-10-00-00/l_abcd1234/p_gear.1.json') >= 0 && a1.indexOf('data-2026-10-01-10-00-00.json') < 0 && a1.indexOf('lib-data-2026-10-01-10-00-00/') < 0
                    && r2 === 'gone' && !a2.some(f => /keep-2026-10-01-10-30-00/.test(f)) && j(rBad) === j(['bad', 'bad', 'bad', 'bad', 'bad', 'missing']) && j(listed) === j(['data-2026-10-01-11-00-00.json']) && r3 === 'moved' && again === '{"again":1}', j([r1, r2, rBad, listed, r3, again, a1]));
                const aside = path.join(bkB, 'removed'); fs.rmSync(aside, { recursive: true, force: true }); fs.mkdirSync(aside, { recursive: true });
                for (let i = 10; i < 23; i++) { const n = 'data-2026-09-' + i + '-08-00-00'; fs.writeFileSync(path.join(aside, n + '.json'), '{}'); if (i < 12) { fs.mkdirSync(path.join(aside, 'lib-' + n, 'l_abcd1234'), { recursive: true }); fs.writeFileSync(path.join(aside, 'lib-' + n, 'l_abcd1234', 'p_gear.1.json'), '{}'); } }
                fs.writeFileSync(path.join(aside, 'notes.txt'), 'x');
                const nP = has('pruneRemoved') ? rg.pruneRemoved(bkB, lib) : -1, left = lsF(aside), nP2 = has('pruneRemoved') ? rg.pruneRemoved(bkB, lib) : -1, nNone = has('pruneRemoved') ? rg.pruneRemoved(path.join(savesB, 'nowhere'), lib) : -1;
                check('cluster V (backups, reqguard.pruneRemoved run for real): of the launch backups set aside the newest ten stay — the older go with their library files, anything else in the folder is left alone — and a folder that is not there costs nothing',
                    nP === 3 && j(left) === j(['data-2026-09-13-08-00-00.json', 'data-2026-09-14-08-00-00.json', 'data-2026-09-15-08-00-00.json', 'data-2026-09-16-08-00-00.json', 'data-2026-09-17-08-00-00.json', 'data-2026-09-18-08-00-00.json', 'data-2026-09-19-08-00-00.json', 'data-2026-09-20-08-00-00.json', 'data-2026-09-21-08-00-00.json', 'data-2026-09-22-08-00-00.json', 'notes.txt']) && nP2 === 0 && nNone === 0 && rg.REMOVED_KEEP === 10, j([nP, left, nP2, nNone]));
            } finally { try { fs.rmSync(savesB, { recursive: true, force: true }); } catch (e) {} }
        }

        /* ---- files the static branch never serves ---- */
        {
            const H = p => (has('savesHidden') ? rg.savesHidden(p) : 'none');
            const hid = ['/saves/data.json', '/saves/preferences.json', '/saves/error.log', '/saves/error.log.1', '/saves/data.json.tmp', '/saves/preferences.json.tmp', '/saves//data.json', '/saves/DATA.JSON', '/saves/Preferences.json', '/saves/data.json.', '/saves/data.json ', '/saves/./data.json'];
            const shown = ['/saves/images/m/a.png', '/saves/backups/data-x.json', '/saves/mock-release.json', '/saves/images/data.json', '/index.html', '/saves/data.json/x', '/data.json', '/saves/library/l_abcd1234/p_a.1.json', '/saves/', 5, undefined];
            check('cluster V (static, reqguard.savesHidden run for real): the save, the profile store, the log and their half-written copies directly under /saves/ are never served as plain files, in any case or spelling the disk reads as them; a picture, a backup, a library file and the app\'s own files are served as before',
                hid.every(p => H(p) === true) && shown.every(p => H(p) === false), j([hid.filter(p => H(p) !== true), shown.filter(p => H(p) !== false)]));
        }

        /* ---- the dev server itself, as a child process on a scratch saves folder ---- */
        const startDev = async (savesX, env) => {
            const portX = await new Promise(r => { const s = http.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
            const childX = require('child_process').spawn(process.execPath, [path.join(__dirname, 'dev-server.js'), savesX, String(portX)], { stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { WAYPOINT_LAUNCH_SECRET: '' }, env || {}) });
            const up = await new Promise(resolve => { let out = ''; const t = setTimeout(() => resolve(false), 15000); childX.stdout.on('data', c => { out += c; if (/Waypoint dev server/.test(out)) { clearTimeout(t); resolve(true); } }); childX.on('exit', () => { clearTimeout(t); resolve(false); }); });
            const stop = async () => { try { childX.kill(); } catch (e) {} await new Promise(r => { const t = setTimeout(r, 2000); childX.on('exit', () => { clearTimeout(t); r(); }); if (childX.exitCode !== null) { clearTimeout(t); r(); } }); };
            return { port: portX, up, stop };
        };
        const seed = savesX => {
            const w = (rel, text) => { const f = path.join(savesX, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
            w('data.json', '{"campaigns":{"c1":{"id":"c1","players":{"u_p":{"key":"the table key"}}}}}'); w('preferences.json', '{"updated":1,"prefs":{"wp_tableKeys":"held keys"}}'); w('error.log', 'a line\n'); w('mock-release.json', '{"tag_name":"v0"}');
            w('backups/data-2026-10-01-09-00-00.json', '{"launch":1}'); w('backups/keep-2026-10-01-09-30-00.json', '{"kept":1}');
            w('images/m_abc/pic.png', 'PIC'); w('images/m_abc/pic2.png', 'PIC2'); w('images/journal/c1/journal.json', '{"entries":[{"id":"h_1","notes":"my own notes"}]}'); w('images/journal/journals.json', '{"keys":["c1"]}'); w('images/journal/c1/h_1.png', 'PAGE'); w('images/journal/c1/h_2.png', 'PAGE2');
        };
        const savesV = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-devV-')); seed(savesV);
        const dv = await startDev(savesV);
        const imgV = path.join(savesV, 'images'), q = encodeURIComponent, read = rel => { try { return fs.readFileSync(path.join(savesV, rel), 'utf8'); } catch (e) { return null; } };
        try {
            const P = dv.port, exact = (rel, keep, body) => hit(P, 'POST', '/api/upload-exact?' + (keep ? 'keep=1&' : '') + 'path=' + q(rel), body === undefined ? 'bytes' : body), fresh = (mapId, name) => hit(P, 'POST', '/api/upload?mapId=' + q(mapId) + '&filename=' + q(name), 'bytes');
            // uploads: only what the app writes
            const refusedExact = ['images/m_a/payload.scf', 'images/m_a/lib.library-ms', 'images/m_a/s.searchConnector-ms', 'images/m_a/run.wsf', 'images/m_a/a.vbe', 'images/m_a/a.jse', 'images/m_a/a.cpl', 'images/m_a/a.reg', 'images/m_a/a.msc', 'images/m_a/a.chm', 'images/m_a/desktop.ini', 'images/desktop.ini', 'images/m_a/NUL', 'images/m_a/CON.png', 'images/m_a/pic.png.', 'images/m_a/trail.png ', 'images/m_a/x.exe.', 'images/m_a/x.html.', 'images/m_a/.hidden', 'images/dir./in.png', 'images/COM1/in.png', 'images/m_a/a.json', 'images/m_a/journal.json', 'images/m_a/noext'];
            const rE = [], rF = [];
            for (const rel of refusedExact) rE.push((await exact(rel, true)).status);
            for (const n of ['p.scf', 'p.library-ms', 'p.wsf', 'p.png.', 'p.exe.', 'p.exe ', 'p.html.', 'desktop.ini', 'NUL', '.hidden', 'p.json']) rF.push((await fresh('m_b', n)).status);
            for (const m of ['NUL', 'audio/COM1', 'm_b.']) rF.push((await fresh(m, 'a.png')).status);
            const okExact = ['images/m_a/ok.png', 'images/m_a/a.svg', 'images/portraits/portrait-ch_1-m1.png', 'images/audio/c_1/ab_song one.mp3', 'images/video/c_1/ab_intro.mp4'], oE = [];
            for (const rel of okExact) oE.push((await exact(rel, true)).status);
            const oF = [await fresh('m_b', 'picture.png'), await fresh('audio/c_1', 's.mp3'), await fresh('video/c_1', 'v.webm')];
            await wait(100); const treeU = walk(imgV);
            const expectU = f => /^(m_abc|journal|journal\/c1|m_a|portraits|audio|audio\/c_1|video|video\/c_1|m_b)\/$/.test(f) || /^m_abc\/pic2?\.png$/.test(f) || /^journal\/(journals\.json|c1\/(journal\.json|h_[12]\.png))$/.test(f) || okExact.indexOf('images/' + f) >= 0 || /^(m_b|audio\/c_1|video\/c_1)\/[a-z0-9]+_(picture\.png|s\.mp3|v\.webm)$/.test(f);
            const strayU = treeU.filter(f => !expectU(f));   // anything on disk that is none of the seeded files and none of the honest uploads
            check('cluster V (the dev server run for real): both upload routes take only what the app itself writes — an import\'s copy or a new file named as a script, a shortcut, a library or settings file, a .json outside the Journal, a name with no extension or a leading dot, one ending in a dot or a space, a Windows device name, or into a folder so named, answers 400 and nothing of it is on disk, no folder made for it, no .part left; a picture, a sound and a video are taken as before',
                dv.up && rE.every(s => s === 400) && rF.every(s => s === 400) && oE.every(s => s === 200) && oF.every(r => r.status === 200 && /^\{"url":"\/saves\/images\/(m_b|audio\/c_1|video\/c_1)\/[a-z0-9]+_(picture\.png|s\.mp3|v\.webm)"\}$/.test(r.body))
                && j(strayU) === '[]' && okExact.every(rel => read(rel) === 'bytes'), j([dv.up, rE, rF, oE, oF.map(r => r.status), strayU]));
            // the Journal and an import
            const jk = ['images/journal/k/journal.json', 'images/journal/journals.json', 'images/%6aournal/k/journal.json', 'images//journal/k/a.png', 'images///journal//k//e.png', 'images/Journal/k/x.png', 'images/JOURNAL/k/journal.json', 'images/journal/k/a.png', 'images/journal./k/c.png', 'images/journal /k/d.png'], rJ = [];
            for (const rel of jk) rJ.push((await exact(rel, true)).status);
            const rawTwice = (await hit(P, 'POST', '/api/upload-exact?keep=1&path=images/%256aournal/k/b.png', 'bytes')).status;   // encoded twice on the wire: the server's own second decode
            const own1 = await exact('images/journal/k2/journal.json', false, '{"entries":[]}'), own2 = await exact('images/journal/k2/h_9.png', false), own3 = await exact('images/journal/journals.json', false, '{"keys":["c1","k2"]}'), near = await exact('images/journalx/y.png', true);
            await wait(100); const treeJ = walk(imgV);
            check('cluster V (the dev server run for real): an import\'s copy (keep=1) never lands in the Journal, in any spelling that reaches the folder on disk — the plain one, another case, an empty segment, a percent-encoded letter encoded once or twice, a trailing dot or space — each answers 400 and nothing is written under images/journal for it, the journal and the registry already there untouched; the Journal\'s own saves (no keep) are written as before, and a picture folder whose name merely begins with journal is copied like any other',
                rJ.every(s => s === 400) && rawTwice === 400 && !treeJ.some(f => /^journal\/k\/|^journal[. ]|^Journal|^JOURNAL/.test(f)) && read('images/journal/c1/journal.json') === '{"entries":[{"id":"h_1","notes":"my own notes"}]}' && own1.status === 200 && own2.status === 200 && own3.status === 200
                && read('images/journal/k2/journal.json') === '{"entries":[]}' && read('images/journal/journals.json') === '{"keys":["c1","k2"]}' && near.status === 200 && read('images/journalx/y.png') === 'bytes', j([rJ, rawTwice, own1.status, own2.status, own3.status, near.status, treeJ.filter(f => /journal/i.test(f))]));
            // sizes, stated up front (the bytes never sent)
            const big = async (rel, n) => (await hit(P, 'POST', '/api/upload-exact?path=' + q(rel), null, { 'Content-Length': n })).status, bigF = async (m, name, n) => (await hit(P, 'POST', '/api/upload?mapId=' + q(m) + '&filename=' + q(name), null, { 'Content-Length': n })).status;
            const sz = [await big('images/audio/c_1/big.mp3', 64 * MBv + 1), await big('images/m_a/big.png', 256 * MBv + 1), await big('images/journal/k2/journal.json', 64 * MBv + 1), await bigF('audio/c_1', 'big.ogg', 64 * MBv + 1), await bigF('m_b', 'big.jpg', 256 * MBv + 1), await big('images/m_a/clip.mp4', 64 * MBv + 1)];
            await wait(100); const treeS = walk(imgV);
            check('cluster V (the dev server run for real): an upload that says it is larger than its kind allows — a sound past 64 MB, a picture past 256 MB, a Journal index past 64 MB, a video file outside the video folder past a sound\'s size — is answered 413 before a byte of it is read, on both routes, and nothing is written, the Journal\'s index as it was',
                sz.every(s => s === 413) && !treeS.some(f => /big\.|clip\.mp4|\.part$/.test(f)) && read('images/journal/k2/journal.json') === '{"entries":[]}', j([sz, treeS.filter(f => /big|part|clip/.test(f))]));
            // delete-image
            const del = (p, more) => hit(P, 'POST', '/api/delete-image', JSON.stringify(Object.assign({ path: p }, more || {})), { 'Content-Type': 'application/json' });
            const dPic = await del('/saves/images/m_abc/pic.png'), dJ = [await del('/saves/images/journal/c1/journal.json'), await del('/saves/images/journal/journals.json'), await del('images/JOURNAL/journals.json'), await del('images/journal./journals.json'), await del('/saves/images/journal/c1/h_1.png'), await del('/saves/images/journal/c1/journal.json', { journal: true }), await del('/saves/images/journal/journals.json', { journal: true })];
            const dWalk = [await del('images/.. /data.json'), await del('images/.../data.json'), await del('images/m_abc/.. /.. /data.json'), await del('images/../data.json')], dOwn = await del('/saves/images/journal/c1/h_2.png', { journal: true }), dGone = await del('/saves/images/m_abc/pic.png');
            check('cluster V (the dev server run for real): delete-image deletes a picture under saves/images and answers 404 for one that is not there; a file of the Journal\'s — a journal\'s index with its notes, the registry, a page\'s picture — answers 400 and keeps its bytes, in any spelling of the folder, and so does an index even by the Journal\'s own word; by that word a page\'s picture goes; a path of dots and spaces answers 400 (it used to be looked for) and the save is untouched',
                dPic.status === 200 && read('images/m_abc/pic.png') === null && read('images/m_abc/pic2.png') === 'PIC2' && dJ.every(r => r.status === 400) && read('images/journal/c1/journal.json') === '{"entries":[{"id":"h_1","notes":"my own notes"}]}' && read('images/journal/journals.json') === '{"keys":["c1","k2"]}' && read('images/journal/c1/h_1.png') === 'PAGE'
                && dWalk.every(r => r.status === 400) && /the table key/.test(read('data.json')) && dOwn.status === 200 && read('images/journal/c1/h_2.png') === null && dGone.status === 404, j([dPic.status, dJ.map(r => r.status), dWalk.map(r => r.status), dOwn.status, dGone.status]));
            // bodies
            const prefsBig = await hit(P, 'POST', '/api/prefs', '{"updated":2,"prefs":{"wp_x":"' + 'p'.repeat(2 * MBv) + '"}}'), prefsStated = await hit(P, 'POST', '/api/prefs', null, { 'Content-Length': 2 * MBv + 1 }), prefsOk = await hit(P, 'POST', '/api/prefs', '{"updated":3,"prefs":{"wp_x":"y"}}');
            const logBig = await hit(P, 'POST', '/api/log', null, { 'Content-Length': 64 * 1024 + 1 }), logOk = await hit(P, 'POST', '/api/log', 'a line'), smallBig = [await hit(P, 'POST', '/api/delete-image', null, { 'Content-Length': 64 * 1024 + 1 }), await hit(P, 'POST', '/api/delete-backup', null, { 'Content-Length': 64 * 1024 + 1 }), await hit(P, 'POST', '/api/restore-backup', null, { 'Content-Length': 64 * 1024 + 1 })];
            const dataStated = await hit(P, 'POST', '/api/data', null, { 'Content-Length': 512 * MBv + 1 }), saveText = '{"campaigns":{"c1":{"id":"c1","name":"— 😀"}}}', dataOk = await hit(P, 'POST', '/api/data', saveText), back = await hit(P, 'GET', '/api/data'), dataBad = await hit(P, 'POST', '/api/data', '{not json');
            check('cluster V (the dev server run for real): every text body is read with a cap — the profile store past 2 MB, a log line, a delete or a restore request past 64 KB and a save past 512 MB answer 413 (before a byte is kept when the length says so) and write nothing — while an honest profile store, log line and save are taken as before, the save read back byte for byte',
                (prefsBig.status === 413 || prefsBig.status === 0) && prefsStated.status === 413 && prefsOk.status === 200 && JSON.parse(read('preferences.json')).updated === 3 && logBig.status === 413 && logOk.status === 200 && smallBig.every(r => r.status === 413) && dataStated.status === 413 && dataOk.status === 200 && back.body === saveText && read('data.json') === saveText && dataBad.status === 400,
                j([prefsBig.status, prefsStated.status, prefsOk.status, logBig.status, logOk.status, smallBig.map(r => r.status), dataStated.status, dataOk.status, back.body === saveText, dataBad.status]));
            // backups
            const bkReq = (route, f) => hit(P, 'POST', '/api/' + route, JSON.stringify({ file: f }), { 'Content-Type': 'application/json' });
            const b1 = await bkReq('delete-backup', 'data-2026-10-01-09-00-00.json'), list1 = JSON.parse((await hit(P, 'GET', '/api/backups')).body).map(b => b.file), b2 = await bkReq('delete-backup', 'keep-2026-10-01-09-30-00.json'), list2 = JSON.parse((await hit(P, 'GET', '/api/backups')).body).map(b => b.file);
            const b3 = [await bkReq('delete-backup', 'removed/data-2026-10-01-09-00-00.json'), await bkReq('restore-backup', 'removed/data-2026-10-01-09-00-00.json'), await bkReq('delete-backup', '../data.json')], b4 = await bkReq('delete-backup', 'data-2026-10-01-09-00-00.json');
            check('cluster V (the dev server run for real): delete-backup moves a launch backup into backups/removed — its bytes kept on disk, gone from the list of snapshots, and no route reaches it there (a name inside removed/ is refused by delete and by restore) — while a snapshot taken by hand is deleted as asked',
                b1.status === 200 && read('backups/removed/data-2026-10-01-09-00-00.json') === '{"launch":1}' && read('backups/data-2026-10-01-09-00-00.json') === null && j(list1) === j(['keep-2026-10-01-09-30-00.json']) && b2.status === 200 && read('backups/keep-2026-10-01-09-30-00.json') === null && !fs.existsSync(path.join(savesV, 'backups', 'removed', 'keep-2026-10-01-09-30-00.json')) && j(list2) === '[]'
                && b3.every(r => r.status === 400) && b4.status === 404 && read('backups/removed/data-2026-10-01-09-00-00.json') === '{"launch":1}', j([b1.status, list1, b2.status, list2, b3.map(r => r.status), b4.status]));
            // static
            fs.writeFileSync(path.join(savesV, 'backups', 'data-2026-10-01-12-00-00.json'), '{"launch":2}'); fs.writeFileSync(path.join(savesV, 'data.json.tmp'), 'half');
            const st = {}; for (const p of ['/saves/data.json', '/saves/preferences.json', '/saves/error.log', '/saves/data.json.tmp', '/saves//data.json', '/saves/DATA.json', '/saves/images/m_abc/pic2.png', '/saves/backups/data-2026-10-01-12-00-00.json', '/saves/mock-release.json', '/index.html']) st[p] = (await hit(P, 'GET', p)).status;
            check('cluster V (the dev server run for real): the save, the profile store, the log and a half-written copy are never served as plain files under /saves/ (404, in another case or with an empty segment too) — so nothing that names a path under saves/ can fetch them — while a picture, a backup, a dev mock release and the app\'s page are served as before; the save is still read through its own route',
                j(st) === j({ '/saves/data.json': 404, '/saves/preferences.json': 404, '/saves/error.log': 404, '/saves/data.json.tmp': 404, '/saves//data.json': 404, '/saves/DATA.json': 404, '/saves/images/m_abc/pic2.png': 200, '/saves/backups/data-2026-10-01-12-00-00.json': 200, '/saves/mock-release.json': 200, '/index.html': 200 }) && (await hit(P, 'GET', '/api/data')).status === 200, j(st));
            // the page's policy as the dev server sends it (cluster P): the real page and the real app folder
            {
                let sgD = null; try { sgD = require('../system/resources/app/shellguard.js'); } catch (e) { sgD = null; }
                const polD = on => { try { return sgD.pagePolicy(on); } catch (e) { return 'no pagePolicy'; } }, STRICT_D = polD(false), DEV_D = polD(true);
                const wS = (rel, text) => { const f = path.join(savesV, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
                wS('images/m_abc/a.png', 'PNG'); wS('images/m_abc/a.js', 'window.__x = 1;'); wS('images/m_abc/a.html', '<script>1</script>'); wS('images/m_abc/a.css', 'body{}'); wS('images/m_abc/a.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>'); wS('images/m_abc/a.mp3', 'ID3');
                const headP = async pth => { const r = await hit(P, 'GET', pth), h = r.h || {}; return [r.status, h['content-security-policy'] || null, h['x-content-type-options'] || null, String(h['content-type'] || '').split(';')[0]]; };
                const prefsP = v => hit(P, 'POST', '/api/prefs', JSON.stringify({ updated: Date.now(), prefs: v === undefined ? {} : { wp_devconsole: v } }), { 'Content-Type': 'application/json' });
                const all = async list => { const out = []; for (const pth of list) out.push(await headP(pth)); return out; };
                const appDirP = path.join(__dirname, '..', 'system', 'app'), firstOf = (rel, ext) => { try { const n = fs.readdirSync(path.join(appDirP, rel)).filter(f => f.endsWith(ext)).sort()[0]; return n ? '/' + rel + '/' + n : null; } catch (e) { return null; } };
                const pagesP = ['/', '/index.html', '/?stream=1', '/?popout=chat:', '/?popout=doc:c_1/i_2'], svgP = firstOf('assets/icons/fa/solid', '.svg'), oggP = firstOf('assets/sounds', '.ogg');
                const off0 = await all(pagesP), page0 = await hit(P, 'GET', '/');
                const plain = await all(['/scripts/net.js', '/scripts/bootprefs.js', '/style.css', '/assets/vendor/peerjs.min.js', '/assets/vendor/mermaid.min.js', '/assets/vendor/html2canvas.min.js', '/assets/legal.txt', '/icon.ico', '/assets/fonts/inter/inter-latin-wght-normal.woff2', oggP || '/none']);
                const svg0 = await headP(svgP || '/none'), api0 = await all(['/api/version', '/api/data', '/api/ping']), lenM = (await hit(P, 'HEAD', '/assets/vendor/mermaid.min.js')).h || {};
                const savesP = await all(['/saves/images/m_abc/a.png', '/saves/images/m_abc/a.js', '/saves/images/m_abc/a.html', '/saves/images/m_abc/a.css', '/saves/images/m_abc/a.svg', '/saves/images/m_abc/a.mp3']);
                check('the page\'s policy as the dev server sends it (the real dev server as a child process, the real app folder): the page — the front page, index.html, the stream window, a chat and a page pop-out — is answered with the strict policy, exactly shellguard\'s text, and carries no policy of its own in a <meta>; the app\'s scripts (the three bundled libraries among them, the diagram library whole), its stylesheet, a text file, the icon, a font and a sound carry none; an SVG of the app carries it; an API answer carries none; everything of the app says its type is not to be guessed',
                    dv.up && !!sgD && /script-src 'self';/.test(STRICT_D) && off0.every(r => j(r) === j([200, STRICT_D, 'nosniff', 'text/html'])) && page0.status === 200 && !/http-equiv/i.test(page0.body) && /<script src="assets\/vendor\/peerjs\.min\.js"><\/script>/.test(page0.body)
                    && plain.every(r => r[0] === 200 && r[1] === null && r[2] === 'nosniff') && ['application/javascript', 'application/javascript', 'text/css', 'application/javascript', 'application/javascript', 'application/javascript', 'text/plain', 'image/x-icon', 'font/woff2', 'audio/ogg'].every((t, i) => plain[i][3] === t)
                    && Number(lenM['content-length']) === fs.statSync(path.join(appDirP, 'assets', 'vendor', 'mermaid.min.js')).size && !!svgP && j(svg0) === j([200, STRICT_D, 'nosniff', 'image/svg+xml']) && api0.every(r => r[0] === 200 && r[1] === null), j([off0, plain, svg0, api0]));
                check('a file under saves/ as the dev server sends it (run for real): sandboxed and never type-guessed as before, and one named as a script, a page or a stylesheet is answered as plain bytes; a picture, an SVG and a sound keep their own type',
                    j(savesP) === j([[200, 'sandbox', 'nosniff', 'image/png'], [200, 'sandbox', 'nosniff', 'application/octet-stream'], [200, 'sandbox', 'nosniff', 'application/octet-stream'], [200, 'sandbox', 'nosniff', 'application/octet-stream'], [200, 'sandbox', 'nosniff', 'image/svg+xml'], [200, 'sandbox', 'nosniff', 'audio/mpeg']]), j(savesP));
                const seen = {}; const step = async (name, fn) => { await fn(); seen[name] = [(await headP('/'))[1], (await headP('/?stream=1'))[1], (await headP('/scripts/net.js'))[1], (await headP('/saves/images/m_abc/a.html'))[1]]; };
                const prefsFileP = path.join(savesV, 'preferences.json');
                await step('on', () => prefsP('on')); await step('off', () => prefsP('off')); await step('upper', () => prefsP('ON')); await step('none', () => prefsP(undefined)); await step('on2', () => prefsP('on'));
                await step('cut', async () => { fs.writeFileSync(prefsFileP, '{"updated":9,"prefs":{"wp_devconsole":"on"'); }); await step('byHand', async () => { fs.writeFileSync(prefsFileP, JSON.stringify({ updated: 10, prefs: { wp_devconsole: 'on' } })); }); await step('gone', async () => { fs.rmSync(prefsFileP, { force: true }); });
                const onRow = j([DEV_D, DEV_D, null, 'sandbox']), offRow = j([STRICT_D, STRICT_D, null, 'sandbox']);
                check('the page\'s policy follows the settings file at each page (the dev server run for real): Developer mode switched on through the app\'s own route, the next page and the next stream window carry text-run-as-code and nothing else changes (a script still carries no policy, a file under saves/ is still sandboxed); switched off, the next page is strict; a value that is not exactly "on", a file without the key, a file cut short and no file at all are strict; a file that says "on" — written by the route or by hand — is on',
                    /script-src 'self' 'unsafe-eval';/.test(DEV_D) && DEV_D !== STRICT_D && j(seen.on) === onRow && j(seen.off) === offRow && j(seen.upper) === offRow && j(seen.none) === offRow && j(seen.on2) === onRow && j(seen.cut) === offRow && j(seen.byHand) === onRow && j(seen.gone) === offRow, j(seen));
            }
        } finally { await dv.stop(); try { fs.rmSync(savesV, { recursive: true, force: true }); } catch (e) {} }

        // the dev server with a launch secret set (WAYPOINT_LAUNCH_SECRET): the gate both servers share, checked first
        {
            const savesG = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-devG-')); seed(savesG);
            const SG = 'a'.repeat(31) + 'b'.repeat(33), dg = await startDev(savesG, { WAYPOINT_LAUNCH_SECRET: SG });
            try {
                const G = (method, p, body, headers) => hit(dg.port, method, p, body, headers), withS = h => Object.assign({ 'X-Waypoint-Launch': SG }, h || {});
                const closed = [await G('GET', '/api/data'), await G('POST', '/api/data', '{"replaced":true}', { 'Content-Type': 'text/plain' }), await G('GET', '/api/prefs', undefined, { 'Sec-Fetch-Site': 'same-origin' }), await G('GET', '/api/prefs.js', undefined, { 'Sec-Fetch-Site': 'same-origin' }), await G('GET', '/'), await G('GET', '/api/ping'), await G('POST', '/api/backup-now', ''), await G('POST', '/api/upload?mapId=m&filename=a.png', 'x'),
                    await G('POST', '/api/delete-image', '{"path":"/saves/images/m_abc/pic.png"}'), await G('GET', '/api/data', undefined, { 'X-Waypoint-Launch': SG.slice(0, 63) + 'c' }), await G('GET', '/api/data', undefined, { 'X-Waypoint-Launch': SG + 'b' }), await G('GET', '/api/data', undefined, { 'X-Waypoint-Launch': 'short' }), await G('OPTIONS', '/api/data')];
                const saveAfter = rdF(path.join(savesG, 'data.json')) || '', picAfter = fs.existsSync(path.join(savesG, 'images', 'm_abc', 'pic.png')), noBackup = lsF(path.join(savesG, 'backups')).length;
                const open = [await G('GET', '/api/data', undefined, withS()), await G('GET', '/api/prefs', undefined, withS({ 'Sec-Fetch-Site': 'same-origin' })), await G('GET', '/', undefined, withS()), await G('POST', '/api/data', '{"mine":true}', withS())];
                const still = [await G('GET', '/api/data', undefined, withS({ Origin: 'https://evil.example' })), await G('GET', '/api/data', undefined, withS({ 'Sec-Fetch-Site': 'cross-site' })), await G('GET', '/api/data', undefined, withS({ Host: 'evil.example' }))];
                check('cluster V (the dev server run for real with a launch secret): with a secret set, a request without it is answered 403 before anything else — reading the save, replacing it with a plain-text POST, the profile store behind a forged Sec-Fetch-Site, the app\'s page, a ping, a snapshot, an upload, a delete — and so is a wrong value of the same length, a longer one and a short one; nothing is read, written or deleted; with the secret the same requests pass, and the old gate still stands behind it (a foreign Origin, a cross-site request, a foreign Host: 403)',
                    dg.up && closed.every(r => r.status === 403) && /the table key/.test(saveAfter) && picAfter && noBackup === 2 && open.every(r => r.status === 200) && /the table key/.test(open[0].body) && /held keys/.test(open[1].body) && rdF(path.join(savesG, 'data.json')) === '{"mine":true}' && still.every(r => r.status === 403),
                    j([dg.up, closed.map(r => r.status), open.map(r => r.status), still.map(r => r.status), noBackup]));
            } finally { await dg.stop(); try { fs.rmSync(savesG, { recursive: true, force: true }); } catch (e) {} }
        }

        /* ---- the shell's own request handling: main.js from its LOCAL_HOSTS line to the server's timeout line, run with Electron's parts as
           recording stubs and mounted on a scratch saves folder (the window and the listen call are outside the slice: nothing of Electron runs) ---- */
        {
            const a = main.indexOf('const LOCAL_HOSTS = '), b = main.indexOf('server.requestTimeout = 0;');
            const savesS = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-shell-')); seed(savesS);
            const rec = { ready: [], hook: null, opened: [] };
            const appStub = { getAppPath: () => path.join(__dirname, '..', 'system', 'resources', 'app'), whenReady: () => ({ then(fn) { rec.ready.push(fn); return { catch() {} }; } }) };
            const electronStub = { session: { defaultSession: { webRequest: { onBeforeSendHeaders() { rec.hook = Array.prototype.slice.call(arguments); } } } } };
            const req2 = n => (n === 'electron' ? electronStub : require(n));
            let shellSrv = null, setPort = null, built = '';
            try {
                if (a < 0 || b < a) throw new Error('main.js: the request handling was not found between its LOCAL_HOSTS line and the timeout line');
                const mk = new Function('app', 'shell', 'updater', 'updateHandler', 'libstore', 'servefile', 'reqguard', 'shellguard', 'fs', 'path', 'http', 'savesDir', 'dataFile', 'SHELL_VERSION', 'UPDATE_REPO', 'appVersion', 'process', 'require',
                    'let port = 0;' + NL + main.slice(a, b) + NL + 'return { server: server, setPort: function(p) { port = p; } };');
                const made = mk(appStub, { openExternal: u => rec.opened.push(u) }, require('../system/resources/app/updater.js'), (rq, rs) => { rs.writeHead(200); rs.end('{"update":"stub"}'); }, lib, sf, rg, require('../system/resources/app/shellguard.js'), fs, path, http, savesS, path.join(savesS, 'data.json'), '1.5.0', 'owner/repo', () => '1.5.0', { on() {}, platform: process.platform, pid: process.pid }, req2);
                shellSrv = made.server; setPort = made.setPort;
                await new Promise(r => shellSrv.listen(0, '127.0.0.1', r)); shellSrv.unref(); setPort(shellSrv.address().port);
            } catch (e) { built = String(e && e.message); }
            try {
                const P = shellSrv ? shellSrv.address().port : 0, T = (method, p, body, headers) => (shellSrv ? hit(P, method, p, body, headers) : Promise.resolve({ status: -1, body: built }));
                rec.ready.forEach(fn => fn());   // the app is ready: the shell tells the session what to send
                const listener = rec.hook && typeof rec.hook[rec.hook.length - 1] === 'function' ? rec.hook[rec.hook.length - 1] : null;
                const sentTo = url => { let r = null; if (listener) listener({ url: url, requestHeaders: {} }, x => { r = x; }); return r && r.requestHeaders ? r.requestHeaders['X-Waypoint-Launch'] : undefined; };
                const SS = sentTo('http://localhost:' + P + '/api/data'), elsewhere = [sentTo('http://localhost:' + (P + 1) + '/'), sentTo('https://evil.example/'), sentTo('http://127.0.0.1:' + P + '/')];
                const withS = h => Object.assign({ 'X-Waypoint-Launch': SS || 'none' }, h || {});
                const closed = [await T('GET', '/api/data'), await T('POST', '/api/data', '{"replaced":true}', { 'Content-Type': 'text/plain' }), await T('GET', '/api/prefs', undefined, { 'Sec-Fetch-Site': 'same-origin' }), await T('GET', '/'), await T('GET', '/api/ping'), await T('GET', '/api/version'), await T('POST', '/api/update-apply', ''), await T('POST', '/api/delete-backup', '{"file":"data-2026-10-01-09-00-00.json"}'),
                    await T('GET', '/api/data', undefined, { 'X-Waypoint-Launch': 'f'.repeat(64) }), await T('OPTIONS', '/api/data')];
                const untouched = /the table key/.test(rdF(path.join(savesS, 'data.json')) || '') && fs.existsSync(path.join(savesS, 'backups', 'data-2026-10-01-09-00-00.json'));
                const open = [await T('GET', '/api/data', undefined, withS()), await T('GET', '/api/ping', undefined, withS()), await T('GET', '/', undefined, withS()), await T('GET', '/api/prefs', undefined, withS({ 'Sec-Fetch-Site': 'same-origin' })), await T('GET', '/api/version', undefined, withS())];
                const still = [await T('GET', '/api/data', undefined, withS({ Origin: 'https://evil.example' })), await T('GET', '/api/data', undefined, withS({ 'Sec-Fetch-Site': 'cross-site' })), await T('GET', '/api/prefs', undefined, withS())];
                check('cluster V (the shell\'s own request handling, main.js run for real): the shell makes a secret at launch and, once the app is ready, has every request to its own origin carry it and no request to any other address; a request without it — any other program on this machine, another account, a browser — is answered 403 before anything else: the save is not read, not replaced by a plain-text POST, no backup deleted, no update started, not even a ping answered; a wrong value is refused; with it the app\'s own page is served as before, and the old gate still stands behind it',
                    built === '' && !!listener && /^[0-9a-f]{64}$/.test(SS || '') && elsewhere.every(v => v === undefined) && closed.every(r => r.status === 403) && untouched && open.every(r => r.status === 200) && /the table key/.test(open[0].body) && /held keys/.test(open[3].body) && still.every(r => r.status === 403),
                    j([built, !!listener, SS && SS.length, elsewhere, closed.map(r => r.status), untouched, open.map(r => r.status), still.map(r => r.status)]));
                // the log: bounded, and a failed append answered
                const lg1 = await T('POST', '/api/log', 'cleanup: 2 kept', withS()), logText = rdF(path.join(savesS, 'error.log')) || '', lgBig = await T('POST', '/api/log', null, withS({ 'Content-Length': 64 * 1024 + 1 }));
                fs.rmSync(path.join(savesS, 'error.log')); fs.mkdirSync(path.join(savesS, 'error.log')); const lgFail = await T('POST', '/api/log', 'no room', withS()), alive = await T('GET', '/api/ping', undefined, withS()); fs.rmdirSync(path.join(savesS, 'error.log')); fs.writeFileSync(path.join(savesS, 'error.log'), 'a line' + NL);
                check('cluster V (the shell\'s own request handling, main.js run for real): a log line is appended with its time; one past 64 KB answers 413; an append the disk refuses is answered 500 (the request used to be left without an answer) and the server goes on',
                    lg1.status === 200 && /^a line\n\S+: cleanup: 2 kept\n$/.test(logText) && lgBig.status === 413 && lgFail.status === 500 && alive.status === 200, j([lg1.status, logText, lgBig.status, lgFail.status, alive.status]));
                // the same rules as the dev server, on the shell's own code
                const q = encodeURIComponent, ex = (rel, keep) => T('POST', '/api/upload-exact?' + (keep ? 'keep=1&' : '') + 'path=' + q(rel), 'bytes', withS());
                const up = [await ex('images/m_a/run.wsf', true), await ex('images/m_a/x.exe.', true), await ex('images/journal/k/journal.json', true), await ex('images//journal/k/a.png', true), await ex('images/%6aournal/k/a.png', true), await T('POST', '/api/upload?mapId=m_b&filename=' + q('p.library-ms'), 'bytes', withS()), await T('POST', '/api/upload?mapId=NUL&filename=a.png', 'bytes', withS()),
                    await T('POST', '/api/upload-exact?path=' + q('images/audio/c_1/big.mp3'), null, withS({ 'Content-Length': 64 * MBv + 1 })), await T('POST', '/api/upload?mapId=m_b&filename=big.png', null, withS({ 'Content-Length': 256 * MBv + 1 }))];
                const upOk = [await ex('images/m_a/ok.png', true), await ex('images/journal/k2/journal.json', false), await T('POST', '/api/upload?mapId=m_b&filename=picture.png', 'bytes', withS())];
                const dl = (p, more) => T('POST', '/api/delete-image', JSON.stringify(Object.assign({ path: p }, more || {})), withS());
                const dels = [await dl('/saves/images/journal/c1/journal.json'), await dl('/saves/images/journal/journals.json', { journal: true }), await dl('/saves/images/journal/c1/h_1.png'), await dl('images/.. /data.json')], delOk = [await dl('/saves/images/m_abc/pic.png'), await dl('/saves/images/journal/c1/h_2.png', { journal: true })];
                const bk = [await T('POST', '/api/delete-backup', '{"file":"data-2026-10-01-09-00-00.json"}', withS()), await T('POST', '/api/delete-backup', '{"file":"keep-2026-10-01-09-30-00.json"}', withS()), await T('POST', '/api/restore-backup', '{"file":"removed/data-2026-10-01-09-00-00.json"}', withS())], bkList = (await T('GET', '/api/backups', undefined, withS())).body;
                const caps = [await T('POST', '/api/prefs', null, withS({ 'Content-Length': 2 * MBv + 1 })), await T('POST', '/api/data', null, withS({ 'Content-Length': 512 * MBv + 1 })), await T('POST', '/api/open-external', null, withS({ 'Content-Length': 64 * 1024 + 1 })), await T('POST', '/api/delete-image', null, withS({ 'Content-Length': 64 * 1024 + 1 })), await T('POST', '/api/restore-backup', null, withS({ 'Content-Length': 64 * 1024 + 1 }))];
                const stat = [await T('GET', '/saves/data.json', undefined, withS()), await T('GET', '/saves/preferences.json', undefined, withS()), await T('GET', '/saves/error.log', undefined, withS()), await T('GET', '/saves/images/m_abc/pic2.png', undefined, withS())];
                await wait(100); const treeS = walk(path.join(savesS, 'images'));
                check('cluster V (the shell\'s own request handling, main.js run for real): the shell holds the same rules as the dev server — an upload that is no picture, sound or video, an import\'s copy into the Journal in any spelling, a folder named as a device and a file past its kind\'s size are refused with nothing written, the honest ones taken; the Journal\'s files are not deleted by the Image Library\'s word and an index by nobody\'s; a launch backup is moved into backups/removed and a hand-made one deleted; every body is capped; the save, the profile store and the log are not served as files',
                    up.slice(0, 7).every(r => r.status === 400) && up.slice(7).every(r => r.status === 413) && upOk.every(r => r.status === 200) && !treeS.some(f => /\.wsf$|\.exe\.?$|library-ms$|\/NUL|^NUL|big\.|\.part$|^journal\/k\//.test(f)) && dels.every(r => r.status === 400) && delOk.every(r => r.status === 200)
                    && rdF(path.join(savesS, 'images', 'journal', 'c1', 'journal.json')) === '{"entries":[{"id":"h_1","notes":"my own notes"}]}' && bk[0].status === 200 && bk[1].status === 200 && bk[2].status === 400 && bkList === '[]' && rdF(path.join(savesS, 'backups', 'removed', 'data-2026-10-01-09-00-00.json')) === '{"launch":1}' && !fs.existsSync(path.join(savesS, 'backups', 'keep-2026-10-01-09-30-00.json'))
                    && caps.every(r => r.status === 413) && j(stat.map(r => r.status)) === j([404, 404, 404, 200]), j([up.map(r => r.status), upOk.map(r => r.status), dels.map(r => r.status), delOk.map(r => r.status), bk.map(r => r.status), bkList, caps.map(r => r.status), stat.map(r => r.status), treeS]));
            } finally { if (shellSrv) shellSrv.close(); try { fs.rmSync(savesS, { recursive: true, force: true }); } catch (e) {} }
        }

        /* ---- both servers wired alike (source) ---- */
        const blockOf = (s, from, to) => { const i = s.indexOf(from), k = s.indexOf(to, i + 1); return i < 0 || k < 0 ? '' : s.slice(i, k); };
        const wired = s => {
            const exactB = blockOf(s, "if (url.pathname === '/api/upload-exact' && req.method === 'POST') {", "if (url.pathname === '/api/upload' && req.method === 'POST') {"), freshB = blockOf(s, "if (url.pathname === '/api/upload' && req.method === 'POST') {", 'try { pathname = decodeURIComponent(url.pathname); }');
            const delB = blockOf(s, "if (url.pathname === '/api/delete-image' && req.method === 'POST') {", "if (url.pathname === '/api/upload-exact' && req.method === 'POST') {"), bkB2 = blockOf(s, "if ((url.pathname === '/api/restore-backup' || url.pathname === '/api/delete-backup') && req.method === 'POST') {", "if (url.pathname === '/api/library')");
            return !/FILE_EXT_BAD/.test(s) && !/function safeSeg\(/.test(s) && !/function safeFileName\(/.test(s) && !/body \+= /.test(s) && !/req\.on\('data'/.test(s)
                && /const keep = url\.searchParams\.get\('keep'\) === '1', kind = reqguard\.exactKind\(segs, keep\);/.test(exactB) && /if \(!kind\) \{ res\.writeHead\(400\); res\.end\('bad path'\); return; \}/.test(exactB) && /\{ keep: keep, max: reqguard\.UPLOAD_MAX\[kind\] \}\);/.test(exactB)
                && /const kind = reqguard\.freshKind\(mapId, rawName\);\n\s*if \(!kind\) \{ res\.writeHead\(400\); return res\.end\('\{"error":"bad name"\}'\); \}/.test(freshB) && /\{ max: reqguard\.UPLOAD_MAX\[kind\] \}\);/.test(freshB)
                && /const segs = reqguard\.deleteTarget\(want\.path, want\.journal === true\);\n\s*if \(!segs\) \{ res\.writeHead\(400\); return res\.end\('\{"error":"bad path"\}'\); \}\n\s*const file = path\.resolve\(savesDir, \.\.\.segs\), imagesRoot = path\.resolve\(savesDir, 'images'\);\n\s*if \(!file\.startsWith\(imagesRoot \+ path\.sep\)\) \{/.test(delB)
                && /if \(url\.pathname === '\/api\/delete-backup'\) \{ reqguard\.removeBackup\(bkDir, file, libstore\); /.test(bkB2) && !/fs\.unlinkSync\(src\)/.test(bkB2)
                && /reqguard\.readBody\(req, res, reqguard\.BODY\.prefs, /.test(s) && /reqguard\.readBody\(req, res, reqguard\.BODY\.data, /.test(s) && (s.match(/reqguard\.readBody\(req, res, reqguard\.BODY\.small, /g) || []).length >= 3
                && /if \(reqguard\.savesHidden\(pathname\)\) \{ res\.writeHead\(404\); return res\.end\('Not Found'\); \}/.test(s);
        };
        const handlerHead = /const server = http\.createServer\(\(req, res\) => \{\n\s*if \(!reqguard\.launchOk\(req, launchSecret\)\) \{ res\.writeHead\(403, \{ 'Content-Type': 'text\/plain' \}\); return res\.end\('Forbidden'\); \}[^\n]*\n\s*if \(!localRequest\(req\)\)/;
        const devHead = /const server = http\.createServer\(\(req, res\) => \{\n\s*if \(LAUNCH_SECRET && !reqguard\.launchOk\(req, LAUNCH_SECRET\)\) \{ res\.writeHead\(403, \{ 'Content-Type': 'text\/plain' \}\); return res\.end\('Forbidden'\); \}[^\n]*\n\s*if \(!localRequest\(req\)\)/;
        const rgSrc = (() => { try { return fs.readFileSync(path.join(__dirname, '..', 'system', 'resources', 'app', 'reqguard.js'), 'utf8').replace(/\r\n/g, '\n'); } catch (e) { return ''; } })();
        check('cluster V (source): the shell and the dev server take every name, kind, size, delete, backup removal, text body and hidden file from the one module (reqguard.js) — neither keeps a refusal list, a name rule or a body reader of its own — and both check the launch secret before anything else in the request handler; the shell\'s secret is made at launch from 32 random bytes and handed to the session, for the very address the window loads, in a step set before the server listens; the dev server takes one only from WAYPOINT_LAUNCH_SECRET (none: the browser flow as before); the shell appends a log line inside a try and prunes the backups set aside at launch',
            wired(main) && wired(dev) && handlerHead.test(main) && devHead.test(dev) && /const reqguard = require\('\.\/reqguard'\);/.test(main) && /const reqguard = require\('\.\.\/system\/resources\/app\/reqguard'\);/.test(dev)
            && /const launchSecret = reqguard\.newSecret\(\);/.test(main) && /function newSecret\(\) \{ return crypto\.randomBytes\(32\)\.toString\('hex'\); \}/.test(rgSrc) && /crypto\.timingSafeEqual\(a, b\)/.test(rgSrc)
            && /app\.whenReady\(\)\.then\(\(\) => reqguard\.sendLaunch\(require\('electron'\)\.session\.defaultSession, \(\) => 'http:\/\/localhost:' \+ port, launchSecret\)\);/.test(main) && main.indexOf('reqguard.sendLaunch(') < main.indexOf('waitForInstanceLock(8000') && /win\.loadURL\(`http:\/\/localhost:\$\{port\}`\);/.test(main)
            && /const LAUNCH_SECRET = process\.env\.WAYPOINT_LAUNCH_SECRET \|\| '';/.test(dev) && !/launchSecret/.test(dev)
            && /try \{ reqguard\.appendLog\(savesDir, body\); res\.writeHead\(200\); res\.end\(\); \} catch \(e\) \{ res\.writeHead\(500\); res\.end\(\); \}/.test(main) && !/appendFileSync/.test(main) && /reqguard\.pruneRemoved\(bkDir, libstore\);/.test(main.slice(main.indexOf('function backupOnLaunch() {'), main.indexOf('backupOnLaunch();'))));
    }

    summed = true;
    console.log(NL + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})();
