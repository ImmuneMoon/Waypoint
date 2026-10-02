/* Offline check of the local server's library storage (system/resources/app/libstore.js, Stage 6 library L1b), run for real: the
   store behind a Node HTTP server on a scratch folder in the OS temp directory (removed at the end) — names checked before any
   path is made, nothing outside saves/library, the 16 MB cap while streaming, UTF-8 across chunk boundaries, one file per
   revision with the newest five kept, delete, and the library snapshot every backup of the save takes and gives back. Then the
   file serving both servers share (system/resources/app/servefile.js, item 21 V1), run for real the same way: a media file's own
   type, its length, a byte range (206), one outside the file (416), HEAD, a missing file, a read that fails. Then a source check
   that the shell (main.js) and the dev server wire both the same way. Then what the local server takes and refuses
   (system/resources/app/reqguard.js, the outside audit of 2026-10-01): its rules run for real, the dev server as a child process on
   scratch saves, and the shell's own request handling (main.js, sliced, Electron's parts as recording stubs) on a scratch folder.
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

    const staticM = /mime = servefile\.mediaType\(ext\) \|\| mime;[^\n]*\n\s*servefile\.serveFile\(req, res, filePath, \{[^\n]*\n\s*'Content-Type': mime,\n\s*\.\.\.\(pathname\.startsWith\('\/saves\/'\) \? \{ 'Content-Security-Policy': 'sandbox', 'X-Content-Type-Options': 'nosniff' \} : \{\}\),[^\n]*\n\s*'Cache-Control': 'no-cache, no-store, must-revalidate'\n\s*\}\);/;
    const staticD = /servefile\.serveFile\(req, res, filePath, Object\.assign\(\{ 'Content-Type': servefile\.mediaType\(ext\) \|\| mimes\[ext\] \|\| 'text\/plain', 'Cache-Control': 'no-cache, no-store, must-revalidate' \}, pathname\.startsWith\('\/saves\/'\) \? \{ 'Content-Security-Policy': 'sandbox', 'X-Content-Type-Options': 'nosniff' \} : \{\}\)\);/;
    check('the shell and the dev server serve every static file through servefile (a media file by its own type, its length, a byte range), a file under saves/ still sandboxed and nosniff, none read whole by hand any more',
        /const servefile = require\('\.\/servefile'\);/.test(main) && /const servefile = require\('\.\.\/system\/resources\/app\/servefile'\);/.test(dev) && staticM.test(main) && staticD.test(dev)
        && !/createReadStream\(filePath\)\.pipe\(res\)/.test(main) && !/createReadStream\(filePath\)\.pipe\(res\)/.test(dev));

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
                const mk = new Function('app', 'shell', 'updater', 'updateHandler', 'libstore', 'servefile', 'reqguard', 'fs', 'path', 'http', 'savesDir', 'dataFile', 'SHELL_VERSION', 'UPDATE_REPO', 'appVersion', 'process', 'require',
                    'let port = 0;' + NL + main.slice(a, b) + NL + 'return { server: server, setPort: function(p) { port = p; } };');
                const made = mk(appStub, { openExternal: u => rec.opened.push(u) }, require('../system/resources/app/updater.js'), (rq, rs) => { rs.writeHead(200); rs.end('{"update":"stub"}'); }, lib, sf, rg, fs, path, http, savesS, path.join(savesS, 'data.json'), '1.5.0', 'owner/repo', () => '1.5.0', { on() {}, platform: process.platform, pid: process.pid }, req2);
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
