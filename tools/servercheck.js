/* Offline check of the local server's library storage (system/resources/app/libstore.js, Stage 6 library L1b), run for real: the
   store behind a Node HTTP server on a scratch folder in the OS temp directory (removed at the end) — names checked before any
   path is made, nothing outside saves/library, the 16 MB cap while streaming, UTF-8 across chunk boundaries, one file per
   revision with the newest five kept, delete, and the library snapshot every backup of the save takes and gives back. Then the
   file serving both servers share (system/resources/app/servefile.js, item 21 V1), run for real the same way: a media file's own
   type, its length, a byte range (206), one outside the file (416), HEAD, a missing file, a read that fails. Then a source check
   that the shell (main.js) and the dev server wire both the same way. Then the shell's windows (system/resources/app/shellguard.js):
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
        && /libstore\.snapshot\(savesDir, bkDir, f\.replace\(\/\\\.json\$\/, ''\)\);/.test(s) && /fs\.unlinkSync\(src\); libstore\.dropSnapshot\(bkDir, file\.replace\(\/\\\.json\$\/, ''\)\);/.test(s)
        && /libstore\.restore\(savesDir, bkDir, file\.replace\(\/\\\.json\$\/, ''\)\);/.test(s) && /libstore\.snapshot\(savesDir, bkDir, bf\);/.test(s);
    check('the shell and the dev server route /api/library to the one store (behind their own local gate, before the save and the static files), a pack is written to a .tmp and renamed (a crash never leaves half a pack), and every backup, backup-now, restore and delete takes the library with the save; the shell\'s launch backup too, and pruning a launch backup drops its snapshot',
        both(main) && both(dev) && /const file = path\.join\(d, pack \+ '\.' \+ rev \+ '\.json'\), tmp = file \+ '\.tmp';\n\s*fs\.writeFileSync\(tmp, body, 'utf8'\); fs\.renameSync\(tmp, file\);/.test(fs.readFileSync(path.join(__dirname, '..', 'system', 'resources', 'app', 'libstore.js'), 'utf8').replace(/\r\n/g, '\n')) && /require\('\.\/libstore'\)/.test(main) && /require\('\.\.\/system\/resources\/app\/libstore'\)/.test(dev)
        && /libstore\.snapshot\(savesDir, bkDir, 'data-' \+ stamp\);/.test(main) && /old\.forEach\(f => \{ fs\.unlinkSync\(path\.join\(bkDir, f\)\); libstore\.dropSnapshot\(bkDir, f\.replace\(\/\\\.json\$\/, ''\)\); \}\);/.test(main));

    const staticM = /mime = servefile\.mediaType\(ext\) \|\| mime;[^\n]*\n\s*servefile\.serveFile\(req, res, filePath, \{[^\n]*\n\s*'Content-Type': mime,\n\s*\.\.\.\(pathname\.startsWith\('\/saves\/'\) \? \{ 'Content-Security-Policy': 'sandbox', 'X-Content-Type-Options': 'nosniff' \} : \{\}\),[^\n]*\n\s*'Cache-Control': 'no-cache, no-store, must-revalidate'\n\s*\}\);/;
    const staticD = /servefile\.serveFile\(req, res, filePath, Object\.assign\(\{ 'Content-Type': servefile\.mediaType\(ext\) \|\| mimes\[ext\] \|\| 'text\/plain', 'Cache-Control': 'no-cache, no-store, must-revalidate' \}, pathname\.startsWith\('\/saves\/'\) \? \{ 'Content-Security-Policy': 'sandbox', 'X-Content-Type-Options': 'nosniff' \} : \{\}\)\);/;
    check('the shell and the dev server serve every static file through servefile (a media file by its own type, its length, a byte range), a file under saves/ still sandboxed and nosniff, none read whole by hand any more',
        /const servefile = require\('\.\/servefile'\);/.test(main) && /const servefile = require\('\.\.\/system\/resources\/app\/servefile'\);/.test(dev) && staticM.test(main) && staticD.test(dev)
        && !/createReadStream\(filePath\)\.pipe\(res\)/.test(main) && !/createReadStream\(filePath\)\.pipe\(res\)/.test(dev));

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
        const pair = () => { const a = http.createServer((q, r) => r.end('OURS')), b = http.createServer((q, r) => a.emit('request', q, r)); a.unref(); b.unref(); return [a, b]; };
        const other = (host, port) => new Promise(r => { const s = http.createServer((q, rs) => rs.end('OTHER')); s.unref(); s.once('error', () => r(null)); s.listen({ port, host, ipv6Only: host === '::1' }, () => r(s)); });
        const hold = (a, b, port, tries) => new Promise(resolve => { let n = 0, got; if (!sg) return resolve({ port: -1, calls: 0 }); sg.listenLoopback(a, b, port, p => { n++; if (n === 1) { got = p; setTimeout(() => resolve({ port: got, calls: n }), 120); } }, tries); });
        const shut = list => Promise.all(list.filter(Boolean).map(s => new Promise(r => { try { s.close(() => r()); } catch (e) { r(); } setTimeout(r, 300).unref(); })));
        {
            const P = await free(), [a, b] = pair(), r = await hold(a, b, P);
            const v4 = await getL('127.0.0.1', P), v6 = has6 ? await getL('::1', P) : 'OURS', late = has6 ? await other('::1', P) : null;
            check('the local server\'s address (shellguard.listenLoopback, run for real): on a free port it holds 127.0.0.1 and [::1] alike, both answered by the app\'s own handler, tells its caller once, and another program can no longer take [::1] on that port' + (has6 ? '' : ' (this machine has no IPv6 loopback: 127.0.0.1 alone)'),
                r.port === P && r.calls === 1 && v4 === 'OURS' && v6 === 'OURS' && late === null, j([r, v4, v6, !!late]));
            await shut([a, b, late]);
        }
        if (has6) {
            const P = await free(), o6 = await other('::1', P), [a, b] = pair(), r = await hold(a, b, P);
            const v4 = await getL('127.0.0.1', r.port), v6 = await getL('::1', r.port), left = await getL('127.0.0.1', P), theirs = await getL('::1', P);
            check('the local server\'s address: with another program already on [::1] of the port it asks for, it does not settle there (a window loading "localhost" would be shown that program\'s page as the app) — it moves to another port where both addresses are its own, leaves nothing of its own on the first port, and tells its caller once',
                !!o6 && r.port > 0 && r.port !== P && r.calls === 1 && v4 === 'OURS' && v6 === 'OURS' && left === 'ECONNREFUSED' && theirs === 'OTHER', j([P, r, v4, v6, left, theirs]));
            await shut([a, b]);
            const [c, d] = pair(), r0 = await hold(c, d, P, 0), left0 = await getL('127.0.0.1', P);
            check('the local server\'s address: asked to take that port or none (the dev server, whose port is named), it holds nothing and says so (0), once', r0.port === 0 && r0.calls === 1 && left0 === 'ECONNREFUSED', j([r0, left0]));
            await shut([c, d, o6]);
            const P2 = await free(), o4 = await other('127.0.0.1', P2), [e, f] = pair(), r2 = await hold(e, f, P2);
            const w4 = await getL('127.0.0.1', r2.port), w6 = await getL('::1', r2.port), left6 = await getL('::1', P2);
            check('the local server\'s address: with another program on 127.0.0.1 of the port it moves on as before, both addresses its own on the new port and [::1] of the first port left alone',
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
        const stub = (plan, prefs) => new Promise(resolve => {
            const rootW = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-shell-'));
            fs.mkdirSync(path.join(rootW, 'system', 'app'), { recursive: true }); fs.writeFileSync(path.join(rootW, 'system', 'app', 'index.html'), '<!doctype html><title>scratch</title>');
            if (prefs !== undefined) { fs.mkdirSync(path.join(rootW, 'saves')); fs.writeFileSync(path.join(rootW, 'saves', 'preferences.json'), prefs); }
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
        check('the shell\'s own server answers on both loopback addresses of its port (main.js run for real): 127.0.0.1 and' + (has6 ? ' [::1], the app\'s page served there too' : ' — this machine has no IPv6 loopback — 127.0.0.1 alone'),
            A.ok && a.ping4.code === 200 && (has6 ? a.ping6.code === 200 && a.page6.code === 200 && /scratch/.test(a.page6.text) : true), j([a.ping4, a.ping6, a.page6]));
        const planB = [['state0', { do: 'state' }], ['wc1', { do: 'wc', url: '{OWN}/?stream=1' }], ['tools0', { do: 'devtools', wc: 0 }], ['tools1', { do: 'devtools', wc: 1 }], ['navTools', { do: 'nav', wc: 1, url: 'https://example.com/x' }], ['state1', { do: 'state' }]];
        toolKeys.slice(0, 4).forEach((k, i) => planB.push(['key' + i, { do: 'key', wc: 0, input: k }]));
        const toolsWin = [['wcT', { do: 'wc', url: 'devtools://devtools/bundled/devtools_app.html' }], ['navInTools', { do: 'nav', wc: 0, url: 'devtools://devtools/bundled/other.html' }]];   // the developer tools' own window: wc is set to its number below
        planB.push(toolsWin[0], ['navInTools', Object.assign({}, toolsWin[1][1], { wc: 2 })]);
        const B = await stub(planB, j({ updated: 9, prefs: { wp_devconsole: 'on' } })), b = B.by;
        const C = await stub([['state0', { do: 'state' }], ['key', { do: 'key', wc: 0, input: toolKeys[0] }], ['tools', { do: 'devtools', wc: 0 }], toolsWin[0], ['navInTools', Object.assign({}, toolsWin[1][1], { wc: 1 })]], '{"updated":9,"prefs":{"wp_devconsole":"on"');
        check('Developer mode at launch (main.js run for real with a settings file already there): a file that says "on" starts with Developer tools on the menu, the keys let through and opened tools left open — an install that had the console on keeps it —, while a link in a window still goes to the system browser and the window the developer tools open in is left to itself; a file cut short (unreadable) starts off: no Developer tools, the key swallowed, tools closed at once, and nothing navigates anywhere but to the pages of the app itself',
            B.ok && b.state0.menus === 1 && hasTools(b.state0.menu) && helpless(b.state0.menu) && b.tools0.open === true && b.tools1.open === true && [0, 1, 2, 3].every(i => b['key' + i].prevented === false) && b.navTools.prevented === true && j(b.navTools.ext) === j(['https://example.com/x']) && j(b.state1.closed) === j([0, 0])
            && b.navInTools.prevented === false && j(b.navInTools.ext) === '[]' && C.ok && C.by.state0.menus === 1 && !hasTools(C.by.state0.menu) && C.by.key.prevented === true && C.by.tools.open === false && C.by.navInTools.prevented === true && j(C.by.navInTools.ext) === '[]', j([B.ok, b.state0, b.tools0, b.navTools, C.ok, C.by.state0, C.by.key, C.by.tools, B.err, C.err]));

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
            const P = await free(), d1 = await start(P), p4 = d1.up ? await getL('127.0.0.1', P, '/api/ping') : 'down', p6 = d1.up && has6 ? await getL('::1', P, '/api/ping') : '200';
            await stop(d1.child);
            const P2 = await free(), blocker = await other(has6 ? '::1' : '127.0.0.1', P2), d2 = await start(P2), left = has6 ? await getL('127.0.0.1', P2, '/api/ping') : 'ECONNREFUSED';
            await stop(d2.child); await shut([blocker]);
            check('the dev server run for real on a scratch saves folder: it answers on 127.0.0.1 and' + (has6 ? ' [::1]' : ' (no IPv6 loopback here) 127.0.0.1 alone') + ' of its port; with another program already on ' + (has6 ? '[::1]' : '127.0.0.1') + ' of the port it was given it does not start beside it — it says the port is taken, exits 1 and leaves nothing listening',
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
            const rigD = (start, o) => {
                o = o || {};
                const store = {}, log = { asks: [], toasts: [], closed: 0, synced: 0, sets: [] }; if (start !== undefined) store.wp_devconsole = start;
                const localStorage = { getItem: k => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null), setItem: (k, v) => { if (o.full) throw new Error('quota'); store[k] = String(v); log.sets.push([k, String(v)]); } };
                const btn = { handlers: {}, addEventListener(t, fn) { this.handlers[t] = fn; } }, ui = id => (id === 'setDevConsoleBtn' ? btn : null);
                const dialogs = () => ({ then(fn) { fn({ showConfirm(msg, cb, opts) { log.asks.push({ msg, cb, opts }); } }); } });
                const win = { wpDevConsole: { close() { log.closed++; } } };
                let ok = true;
                try { new Function('ui', 'localStorage', 'window', 'toast', 'syncPanel', 'dialogs', '"use strict";\n' + stSrc.slice(dA, dB).split("import('./dialogs.js')").join('dialogs()'))(ui, localStorage, win, m => log.toasts.push(String(m)), () => { log.synced++; }, dialogs); } catch (e) { ok = false; }
                return { ok: ok && dA > 0 && dB > dA, log, store, click: () => btn.handlers.click && btn.handlers.click(), answer: (yes, n) => { const q = log.asks[n === undefined ? log.asks.length - 1 : n]; if (q) q.cb(yes); } };
            };
            const r1 = rigD(undefined); r1.click(); const asked1 = r1.log.asks.length, before1 = r1.store.wp_devconsole; r1.answer(false); const afterNo = [r1.store.wp_devconsole, r1.log.sets.length, r1.log.toasts.length];
            r1.click(); const asked2 = r1.log.asks.length; r1.answer(true); const afterYes = [r1.store.wp_devconsole, r1.log.toasts.slice(-1)[0], r1.log.synced];
            r1.click(); const afterOff = [r1.store.wp_devconsole, r1.log.asks.length, r1.log.closed, r1.log.toasts.slice(-1)[0], r1.log.synced];
            r1.click(); const asked3 = r1.log.asks.length; r1.answer(true); const again = r1.store.wp_devconsole;
            const r2 = rigD('off'); r2.click(); const offAsks = r2.log.asks.length; r2.answer(false);
            const r6 = rigD(undefined); r6.click(); r6.click(); r6.click(); const once = r6.log.asks.length; r6.answer(false); r6.click(); const twice = r6.log.asks.length; r6.answer(true); r6.click(); r6.click(); const afterOn = [r6.log.asks.length, r6.store.wp_devconsole];
            const r3 = rigD('on'); r3.click(); const r4 = rigD('ON'); r4.click(); const r5 = rigD(undefined, { full: true }); r5.click(); let full = 'ok'; try { r5.answer(true); } catch (e) { full = 'threw'; }
            check('the Developer mode switch (settings.js sliced by its devmode markers, run on a page of plain objects): switching it on asks first, every time, in the app\'s own question (never one Enter answers), with the warning\'s words, one question at a time (a second click while it is open asks nothing more); nothing is stored until Yes, and No leaves the value as it was with nothing said; Yes stores "on" and says what it unlocks (~ and Ctrl+Shift+I); switching it off asks nothing, stores "off", closes the in-app console and says so; a value that is not exactly "on" counts as off; a store that cannot be written stops nothing',
                r1.ok && asked1 === 1 && before1 === undefined && r1.log.asks[0].msg === WORDS && j(r1.log.asks[0].opts) === j({ noEnter: true }) && j(afterNo) === j([undefined, 0, 0]) && asked2 === 2 && r1.log.asks[1].msg === WORDS && afterYes[0] === 'on' && /~/.test(afterYes[1]) && /Ctrl\+Shift\+I/.test(afterYes[1]) && /^Developer mode on/.test(afterYes[1]) && afterYes[2] === 1
                && j(afterOff) === j(['off', 2, 1, 'Developer mode off.', 2]) && asked3 === 3 && again === 'on' && r2.ok && offAsks === 1 && r2.store.wp_devconsole === 'off' && r3.ok && r3.log.asks.length === 0 && r3.store.wp_devconsole === 'off' && r3.log.closed === 1 && r4.ok && r4.log.asks.length === 1 && r4.store.wp_devconsole === 'ON' && r5.ok && full === 'ok' && r6.ok && once === 1 && twice === 2 && j(afterOn) === j([3, 'off']),
                j([r1.ok, asked1, r1.log.asks[0] && r1.log.asks[0].msg === WORDS, afterNo, afterYes, afterOff, asked3, again, offAsks, r3.log.asks.length, r4.log.asks.length, full, once, twice, afterOn]));
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
            const ix = readApp('index.html'), tips = readApp('scripts/tips.js'), tour = readApp('scripts/tutorial.js');
            const row = ix.slice(ix.indexOf('id="setDevConsoleState"') - 200, ix.indexOf('id="setResetLayoutBtn"'));
            check('Developer mode in words (the page, Help, the tour, the tip): the switch in Settings \u25b8 Advanced is called Developer mode and its line says what it unlocks (~ for the console, Ctrl+Shift+I for the developer tools in the installed app) and that it is off by default; its ids and its stored key are the old ones, so an install that had it on keeps it on; Help and the tour\'s Settings step name it; nothing a user reads calls the switch a "Developer console" any more; the console\'s own read of the key is unchanged',
                />Developer mode <span id="setDevConsoleState"/.test(row) && /<button class="tool ghost" id="setDevConsoleBtn"[^>]*>Toggle Developer mode<\/button>/.test(row) && /<b>~<\/b>/.test(row) && /Ctrl\+Shift\+I/.test(row) && /Off by default/.test(row) && !/Developer console/i.test(row)
                && /id="helpDevMode"/.test(ix) && /<b>Developer mode<\/b>/.test(ix.slice(ix.indexOf('id="helpDevMode"'), ix.indexOf('id="helpDevMode"') + 1200)) && /<kbd>Ctrl \+ Shift \+ I<\/kbd>/.test(ix.slice(ix.indexOf('id="helpDevMode"'), ix.indexOf('id="helpDevMode"') + 1200)) && /<kbd>~<\/kbd>/.test(ix.slice(ix.indexOf('id="helpDevMode"'), ix.indexOf('id="helpDevMode"') + 1200)) && /never because someone asked you to/.test(ix.slice(ix.indexOf('id="helpDevMode"'), ix.indexOf('id="helpDevMode"') + 1200))
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
        const keepBoth = s => { const b = s.slice(s.indexOf("if (url.pathname === '/api/upload-exact' && req.method === 'POST') {"), s.indexOf("if (url.pathname === '/api/upload' && req.method === 'POST') {")); return b.length > 200 && /servefile\.saveUpload\(req, res, savePath, JSON\.stringify\(\{ url: '\/saves\/' \+ segs\.join\('\/'\) \}\), \{ keep: url\.searchParams\.get\('keep'\) === '1' \}\);/.test(b); };
        const keepOnlyExact = s => (s.match(/\{ keep: url\.searchParams\.get\('keep'\) === '1' \}/g) || []).length === 1;
        check('the shell and the dev server hand upload-exact\'s keep flag to saveUpload (and only there: a new file into the library is named afresh each time); the import\'s copies (main.js) ask for it on every file, the Journal\'s, a portrait\'s and the tutorial\'s own saves do not',
            keepBoth(main) && keepBoth(dev) && keepOnlyExact(main) && keepOnlyExact(dev)
            && /fetch\('\/api\/upload-exact\?keep=1&path=' \+ encodeURIComponent\(relPath\), \{ method: 'POST', body: body \}\)/.test(fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'main.js'), 'utf8'))
            && ['handouts.js', 'sheets.js', 'tutorial.js'].every(f => { const s = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', f), 'utf8'); return /upload-exact\?path=/.test(s) && !/keep=1/.test(s); }));
    }

    summed = true;
    console.log(NL + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})();
