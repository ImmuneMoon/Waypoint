/* Offline check of the local server's library storage (system/resources/app/libstore.js, Stage 6 library L1b), run for real: the
   store behind a Node HTTP server on a scratch folder in the OS temp directory (removed at the end) — names checked before any
   path is made, nothing outside saves/library, the 16 MB cap while streaming, UTF-8 across chunk boundaries, one file per
   revision with the newest five kept, delete, and the library snapshot every backup of the save takes and gives back. Then the
   file serving both servers share (system/resources/app/servefile.js, item 21 V1), run for real the same way: a media file's own
   type, its length, a byte range (206), one outside the file (416), HEAD, a missing file, a read that fails. Then a source check
   that the shell (main.js) and the dev server wire both the same way.
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

    summed = true;
    console.log(NL + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})();
