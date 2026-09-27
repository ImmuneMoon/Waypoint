/* Offline check of the local server's library storage (system/resources/app/libstore.js, Stage 6 library L1b), run for real: the
   store behind a Node HTTP server on a scratch folder in the OS temp directory (removed at the end) — names checked before any
   path is made, nothing outside saves/library, the 16 MB cap while streaming, UTF-8 across chunk boundaries, one file per
   revision with the newest five kept, delete, and the library snapshot every backup of the save takes and gives back. Then a
   source check that the shell (main.js) and the dev server wire it the same way.
   Usage: node tools/servercheck.js   (exit 1 on any failure) */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const NL = String.fromCharCode(10);
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok       ', name); } else { fail++; console.log('FAIL     ', name, detail !== undefined ? '-> ' + String(detail).slice(0, 300) : ''); } }
const j = v => JSON.stringify(v);
const lib = require('../system/resources/app/libstore.js');

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

    const main = fs.readFileSync(path.join(__dirname, '..', 'system', 'resources', 'app', 'main.js'), 'utf8').replace(/\r\n/g, '\n'), dev = fs.readFileSync(path.join(__dirname, 'dev-server.js'), 'utf8').replace(/\r\n/g, '\n');
    const route = "    if (url.pathname === '/api/library') { libstore.handle(req, res, url, savesDir); return; }", both = s => s.indexOf(route) > 0 && s.indexOf(route) < s.indexOf("if (url.pathname === '/api/data') {") && s.indexOf(route) < s.indexOf('try { pathname = decodeURIComponent(url.pathname); }')
        && /libstore\.snapshot\(savesDir, bkDir, f\.replace\(\/\\\.json\$\/, ''\)\);/.test(s) && /fs\.unlinkSync\(src\); libstore\.dropSnapshot\(bkDir, file\.replace\(\/\\\.json\$\/, ''\)\);/.test(s)
        && /libstore\.restore\(savesDir, bkDir, file\.replace\(\/\\\.json\$\/, ''\)\);/.test(s) && /libstore\.snapshot\(savesDir, bkDir, bf\);/.test(s);
    check('the shell and the dev server route /api/library to the one store (behind their own local gate, before the save and the static files), a pack is written to a .tmp and renamed (a crash never leaves half a pack), and every backup, backup-now, restore and delete takes the library with the save; the shell\'s launch backup too, and pruning a launch backup drops its snapshot',
        both(main) && both(dev) && /const file = path\.join\(d, pack \+ '\.' \+ rev \+ '\.json'\), tmp = file \+ '\.tmp';\n\s*fs\.writeFileSync\(tmp, body, 'utf8'\); fs\.renameSync\(tmp, file\);/.test(fs.readFileSync(path.join(__dirname, '..', 'system', 'resources', 'app', 'libstore.js'), 'utf8').replace(/\r\n/g, '\n')) && /require\('\.\/libstore'\)/.test(main) && /require\('\.\.\/system\/resources\/app\/libstore'\)/.test(dev)
        && /libstore\.snapshot\(savesDir, bkDir, 'data-' \+ stamp\);/.test(main) && /old\.forEach\(f => \{ fs\.unlinkSync\(path\.join\(bkDir, f\)\); libstore\.dropSnapshot\(bkDir, f\.replace\(\/\\\.json\$\/, ''\)\); \}\);/.test(main));

    summed = true;
    console.log(NL + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})();
