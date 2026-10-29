/* Offline check of Waypoint's self-update (system/resources/app/updater.js), run for real: the updater against a mock release
   served from a loopback HTTP server, on scratch installs in the OS temp directory (removed at the end), with key pairs made here.
   A one-click update replaces the app's own files, so the shell takes one only when it is signed by the key whose public half the
   shell carries (updatekey.js): the signed words are the zip's name, its SHA-256 and the version, one per line. Checked: a signed
   update applies; every unsigned, mis-signed, relabelled or altered one is refused with the install byte for byte as it was; the
   older guards (the checksum, the paths, the size caps, the swap put back); the way back (rollbackAppUpdate and its route); the
   key tool (tools/signkey.js) and the release build's refusal to build without the key (tools/release.js), each run as a child
   process on a scratch copy of the repository; the Settings buttons, sliced from settings.js and run on a page of plain objects;
   and the words the installer dialog, Help and the tour use.
   An update that changes the core (Part D): the shell downloads the installer to a file, checks it against the same key (the
   signed words name the installer, so a zip's signature never stands for it), and starts it over the copy that is running —
   downloadInstaller, runInstaller (its spawn is this suite's own: no process is ever started here, and no installer is ever
   run) and the four routes, each refusal leaving nothing behind; the core's revision (tools/shellrev.js: the recorded hash is
   the core's, minShell is its `since`, and the release build refuses a stale record); the installer script's two additions,
   pinned; and the page's one-click core update, run on a page of plain objects, with every fallback to the walk-through.
   The dev server (tools/dev-server.js), a scratch copy of it run as a child process against a signed release newer than it:
   it never updates, restores or installs over the source tree it runs from, only a scratch copy of system/ named on purpose.
   The list of names the website that serves Waypoint refuses: no tracked file, and no file of the app folder a release zips, names
   the owner's own sheet website, which this suite writes only as the SHA-256 of its name.
   Usage: node tools/updatercheck.js   (exit 1 on any failure) */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), zlib = require('zlib'), crypto = require('crypto'), cp = require('child_process');
const NL = String.fromCharCode(10);
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok       ', name); } else { fail++; console.log('FAIL     ', name, detail !== undefined ? '-> ' + String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 500) : ''); } }
const j = v => JSON.stringify(v);
const ROOT = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, NL);
const has = rel => fs.existsSync(path.join(ROOT, rel));
const updater = require('../system/resources/app/updater.js');
let signkey = null; try { signkey = require('./signkey.js'); } catch (e) { signkey = null; }
let shellrev = null; try { shellrev = require('./shellrev.js'); } catch (e) { shellrev = null; }
const REFUSED = /^unsigned update — refused$/;

function slice(rel, name) {
    const src = read(rel), a = '// [updatercheck:' + name + '-start]', b = '// [updatercheck:' + name + '-end]';
    const i = src.indexOf(a), k = src.indexOf(b);
    if (i < 0 || k < 0 || k <= i) throw new Error('updatercheck: marker ' + name + ' not found in ' + rel);
    if (src.indexOf(a, i + 1) >= 0 || src.indexOf(b, k + 1) >= 0) throw new Error('updatercheck: marker ' + name + ' is not unique in ' + rel);
    return src.slice(i + a.length, k);
}

/* ---- a ZIP made by hand (stored or deflated entries): what the updater's own reader takes ---- */
const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c; } return b => { let c = -1; for (let i = 0; i < b.length; i++) c = t[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }; })();
// entries: { name, data (a string or a Buffer), deflate } or { name, raw (bytes already deflated), usize }
function zip(entries) {
    const locals = [], central = []; let off = 0;
    for (const e of entries) {
        const name = Buffer.from(e.name, 'utf8'), data = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data || '', 'utf8');
        const body = e.raw || (e.deflate ? zlib.deflateRawSync(data) : data), method = (e.raw || e.deflate) ? 8 : 0, usize = e.raw ? e.usize : data.length, crc = e.raw ? 0 : CRC(data);
        const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(method, 8); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(usize >>> 0, 22); lh.writeUInt16LE(name.length, 26);
        const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(method, 10); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(usize >>> 0, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42);
        locals.push(lh, name, body); central.push(ch, name); off += 30 + name.length + body.length;
    }
    const cd = Buffer.concat(central), end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
    return Buffer.concat(locals.concat([cd, end]));
}
const appZip = (version, extra, o) => zip([{ name: 'index.html', data: '<!doctype html><title>new ' + version + '</title>', deflate: true }]
    .concat(o && o.noVersion ? [] : [{ name: 'version.json', data: JSON.stringify(Object.assign({ version: o && o.says !== undefined ? o.says : version }, o && 'minShell' in o ? { minShell: o.minShell } : {})) + NL }])
    .concat([{ name: 'scripts/main.js', data: '// new ' + version + NL }]).concat(extra || []));
const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');

/* ---- key pairs made here: the suite never sees the real one ---- */
const K = crypto.generateKeyPairSync('ed25519'), PUB = K.publicKey.export({ type: 'spki', format: 'pem' });
const K2 = crypto.generateKeyPairSync('ed25519'), PUB2 = K2.publicKey.export({ type: 'spki', format: 'pem' });
// the signature as the release build must make it: Ed25519 over "<zip name>\n<sha256 hex>\n<version>\n", base64
const sign = (name, sha, ver, key) => crypto.sign(null, Buffer.from(name + NL + sha + NL + ver + NL, 'utf8'), key || K.privateKey).toString('base64');
// an "installer" for the mock release: bytes that are no program at all (this suite never starts anything it downloads)
const SETUP_NAME = 'Waypoint_Setup.exe', SETUP = Buffer.concat([Buffer.from('not a program: bytes for a test' + NL), crypto.randomBytes(300 * 1024)]);

/* ---- scratch installs ---- */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-updatercheck-'));
let seq = 0;
function install(version) {   // <root>/system/app (a page, its version.json, a script) with the table's saves beside it
    const root = path.join(tmp, 'i' + (++seq)), sys = path.join(root, 'system'), app = path.join(sys, 'app');
    fs.mkdirSync(path.join(app, 'scripts'), { recursive: true }); fs.mkdirSync(path.join(root, 'saves'), { recursive: true });
    fs.writeFileSync(path.join(app, 'index.html'), '<!doctype html><title>old ' + version + '</title>');
    fs.writeFileSync(path.join(app, 'version.json'), JSON.stringify({ version }) + NL);
    fs.writeFileSync(path.join(app, 'scripts', 'main.js'), '// old ' + version + NL);
    fs.writeFileSync(path.join(root, 'saves', 'data.json'), '{"campaigns":{"c_1":{"name":"kept"}}}');
    return { root, sys, app };
}
// every folder and file under a folder, each file by the digest of its bytes: two trees are the same when these words are
function tree(dir) { const out = {}; (function walk(d, rel) { for (const f of fs.readdirSync(d).sort()) { const p = path.join(d, f), r = rel ? rel + '/' + f : f; if (fs.statSync(p).isDirectory()) { out[r + '/'] = 'dir'; walk(p, r); } else out[r] = sha256(fs.readFileSync(p)); } })(dir, ''); return j(out); }
const verOf = dir => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'version.json'), 'utf8')).version; } catch (e) { return null; } };
const within = (p, ms, what) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('no answer within ' + ms + ' ms: ' + what)), ms); t.unref(); Promise.resolve(p).then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); }); });

let summed = false;   // a check that never settles (a promise nothing answers) would let Node exit with no summary and code 0: that is a failure
process.on('exit', code => { if (!summed && !code) { console.log(NL + 'FAIL      the asynchronous checks never finished (a promise was left waiting)'); process.exitCode = 1; } });
(async () => {
    /* ---- the mock release: /<id>/latest is the release as the API lists it, /<id>/<asset> an asset's bytes ---- */
    const releases = {};
    const server = http.createServer((req, res) => {
        const m = /^\/(r\d+)\/(.+)$/.exec(new URL(req.url, 'http://localhost').pathname), rel = m && releases[m[1]];
        res.on('error', () => {});
        if (!rel) { res.writeHead(404); return res.end(); }
        if (m[2] === 'latest') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(rel.json)); }
        const f = rel.files[decodeURIComponent(m[2])];
        rel.hits[decodeURIComponent(m[2])] = (rel.hits[decodeURIComponent(m[2])] || 0) + 1;   // how often each asset was asked for
        if (typeof f === 'function') return f(req, res);   // a body made as it is sent
        if (f === undefined) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Length': Buffer.byteLength(f) }); res.end(f);
    });
    server.on('clientError', (e, sock) => { try { sock.destroy(); } catch (_) {} });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    server.unref();   // a listening server alone never keeps Node alive: a stalled check lets the loop empty, so the exit guard reports it
    const base = 'http://127.0.0.1:' + server.address().port;
    /* spec: tag, zip (bytes; default a well-formed app of that version), zipName, shaText / noSha, sigText / noSig, served (the bytes
       the zip's address really gives), manifest, noZip, installer (an installer with no signature beside it), setup (an installer as
       the release build publishes it: { bytes, served, noSig, sigText, key, size }). What is not given is what an honest build publishes. */
    function publish(spec) {
        const id = 'r' + (++seq), tag = spec.tag, zipName = spec.zipName || ('waypoint-app-' + tag + '.zip'), z = spec.zip || appZip(tag), digest = sha256(z);
        const files = {}, sizes = {};
        if (!spec.noZip) files[zipName] = spec.served || z;
        if (!spec.noZip && !spec.noSha) files[zipName + '.sha256'] = spec.shaText !== undefined ? spec.shaText : digest + '  ' + zipName + NL;
        if (!spec.noZip && !spec.noSig) files[zipName + '.sig'] = spec.sigText !== undefined ? spec.sigText : sign(zipName, digest, tag, spec.key) + NL;
        if (spec.manifest) files['manifest.json'] = JSON.stringify(spec.manifest);
        if (spec.installer) files[SETUP_NAME] = 'MZ';
        if (spec.setup) {
            const s = spec.setup, bytes = s.bytes || SETUP;
            files[SETUP_NAME] = s.served || bytes; sizes[SETUP_NAME] = s.size !== undefined ? s.size : bytes.length;
            if (!s.noSig) files[SETUP_NAME + '.sig'] = s.sigText !== undefined ? s.sigText : sign(SETUP_NAME, sha256(bytes), tag, s.key) + NL;
        }
        const sizeOf = n => sizes[n] !== undefined ? sizes[n] : (typeof files[n] === 'function' ? 0 : Buffer.byteLength(files[n]));
        releases[id] = { files, hits: {}, json: { tag_name: tag, body: 'notes', html_url: 'https://example.invalid/releases/' + tag, assets: Object.keys(files).map(n => ({ name: n, size: sizeOf(n), browser_download_url: base + '/' + id + '/' + encodeURIComponent(n) })) } };
        return base + '/' + id + '/latest';
    }
    const hitsOf = (api, name) => { const m = /\/(r\d+)\/latest$/.exec(api); return (m && releases[m[1]] && releases[m[1]].hits[name]) || 0; };
    async function look(spec) {
        const o = { repo: 'owner/repo', currentVersion: spec.from || '1.5.0', shellVersion: spec.shell || '1.5.0', apiUrl: publish(spec) };
        if ('self' in spec) o.selfInstall = spec.self;
        if ('checkKey' in spec) o.pubKey = spec.checkKey;
        return within(updater.checkForUpdate(o), 60000, 'check');
    }
    // look the release up and apply it to a fresh scratch install, as the shell's own route does
    async function attempt(spec) {
        const inst = install(spec.from || '1.5.0'), before = tree(inst.root);
        let info = null, res = null, err = null;
        try {
            info = await look(spec);
            const opts = { systemDir: inst.sys, appZip: info.appZip, appZipName: info.appZipName, sha256: info.sha256, sig: info.sig, version: info.latest };
            if (!spec.noKeyOpt) opts.pubKey = 'pubKey' in spec ? spec.pubKey : PUB;
            if ('shellOpt' in spec) opts.shellVersion = spec.shellOpt;
            res = await within(updater.applyAppUpdate(opts), 120000, 'apply');
        } catch (e) { err = String(e && e.message || e); }
        return { inst, info, res, err, same: tree(inst.root) === before };
    }
    const refused = (r, re) => !!r.err && !r.res && (re || REFUSED).test(r.err) && r.same;
    const why = rs => j([].concat(rs).map(r => [r.err, r.same, r.res && r.res.ok]));

    try {
        /* ================= A. the signature ================= */
        const good = await attempt({ tag: '1.5.1' });
        check('a signed, well-formed update is applied: the app folder is the new version (its version.json the release\'s tag), the version is reported, the old app is kept whole as app.prev, and nothing else in the install changes (no app.new, the saves as they were)',
            !good.err && good.res && good.res.ok === true && good.res.version === '1.5.1' && verOf(good.inst.app) === '1.5.1' && /new 1\.5\.1/.test(fs.readFileSync(path.join(good.inst.app, 'index.html'), 'utf8'))
            && verOf(path.join(good.inst.sys, 'app.prev')) === '1.5.0' && /old 1\.5\.0/.test(fs.readFileSync(path.join(good.inst.sys, 'app.prev', 'index.html'), 'utf8')) && fs.existsSync(path.join(good.inst.sys, 'app.prev', 'scripts', 'main.js'))
            && !fs.existsSync(path.join(good.inst.sys, 'app.new')) && j(fs.readdirSync(good.inst.sys).sort()) === j(['app', 'app.prev']) && fs.readFileSync(path.join(good.inst.root, 'saves', 'data.json'), 'utf8') === '{"campaigns":{"c_1":{"name":"kept"}}}', why(good));
        check('what a check reports of a signed release: the signature\'s address beside the checksum\'s, the zip\'s own name as the release lists it, and a one-click update on offer',
            !!good.info && /waypoint-app-1\.5\.1\.zip\.sig$/.test(String(good.info.sig)) && /\.zip\.sha256$/.test(String(good.info.sha256)) && good.info.appZipName === 'waypoint-app-1.5.1.zip' && good.info.canHotUpdate === true && good.info.needsInstaller === false && good.info.newer === true, good.info);

        const noSig = await attempt({ tag: '1.5.1', noSig: true });
        check('a release with a zip and its checksum but no signature is refused ("unsigned update — refused") and the install is byte for byte as it was: nothing unpacked, no app.new, no app.prev', refused(noSig), why(noSig));
        const otherKey = await attempt({ tag: '1.5.1', key: K2.privateKey });
        check('a signature made with another key is refused, the install untouched', refused(otherKey), why(otherKey));
        // an old signed zip offered again as something newer: under its own name with its own signature, or renamed to the new tag
        const z151 = appZip('1.5.1'), d151 = sha256(z151), s151 = sign('waypoint-app-1.5.1.zip', d151, '1.5.1') + NL;
        const relabelA = await attempt({ tag: '1.5.2', zip: z151, zipName: 'waypoint-app-1.5.1.zip' });
        const relabelB = await attempt({ tag: '1.5.2', zip: z151, sigText: s151 });
        const relabelC = await attempt({ tag: '1.5.2', zip: appZip('1.5.2'), sigText: s151 });
        check('a signed older zip relabelled as a newer release is refused: under its own name and signature with a newer tag, renamed to the newer tag with its old signature, and an old signature beside a newer zip — the version is part of what is signed, and the zip\'s name must be the release\'s own',
            refused(relabelA) && refused(relabelB) && refused(relabelC), why([relabelA, relabelB, relabelC]));
        const zA = appZip('1.5.1'), otherDigest = await attempt({ tag: '1.5.1', zip: zA, sigText: sign('waypoint-app-1.5.1.zip', sha256(Buffer.from('another file')), '1.5.1') + NL });
        check('a signature over another digest than the published checksum is refused', refused(otherDigest), why(otherDigest));
        const changed = appZip('1.5.1', [{ name: 'scripts/extra.js', data: 'alert(1)' }]);
        const swapped = await attempt({ tag: '1.5.1', zip: zA, served: changed });
        const swapped2 = await attempt({ tag: '1.5.1', zip: zA, served: changed, shaText: sha256(changed) + '  waypoint-app-1.5.1.zip' + NL });
        check('a zip whose bytes changed after it was signed is refused: against the signed checksum ("checksum mismatch"), and with the checksum file rewritten to match the changed zip (the signature no longer covers it)',
            refused(swapped, /^checksum mismatch — update aborted$/) && refused(swapped2), why([swapped, swapped2]));
        const wrongInside = await attempt({ tag: '1.5.1', zip: appZip('1.5.1', null, { says: '99.0.0' }) });
        const noInside = await attempt({ tag: '1.5.1', zip: appZip('1.5.1', null, { noVersion: true }) });
        const numInside = await attempt({ tag: '1.5.1', zip: appZip('1.5.1', null, { says: 1.5 }) });
        check('a correctly signed zip whose own version.json does not say the release\'s version (another version, none at all, a number) is refused after unpacking: app.new removed, the app and app.prev as they were',
            [wrongInside, noInside, numInside].every(r => refused(r, /not version 1\.5\.1/)), why([wrongInside, noInside, numInside]));
        // the signed archive names the core it needs: the manifest beside it is not signed, so the archive's own word is the one that holds
        const needs = v => appZip('1.5.1', null, { minShell: v });
        const tooNew = await attempt({ tag: '1.5.1', zip: needs('1.6.0'), shellOpt: '1.5.0' }), noShell = await attempt({ tag: '1.5.1', zip: needs('1.5.0') }), junkNeeds = [];
        for (const v of ['<b>', 16, '', { v: 1 }]) junkNeeds.push(await attempt({ tag: '1.5.1', zip: needs(v), shellOpt: '9.9.9' }));
        const enough = await attempt({ tag: '1.5.1', zip: needs('1.6.0'), shellOpt: '1.6.0' }), exact = await attempt({ tag: '1.5.1', zip: needs('1.5.0'), shellOpt: '1.5.0' }), nullNeeds = await attempt({ tag: '1.5.1', zip: needs(null), shellOpt: '1.5.0' });
        check('a correctly signed zip whose own version.json names a core newer than this copy\'s (minShell) is refused after unpacking — "this update needs a newer core" — the install untouched, whatever the unsigned manifest beside it says or omits; so is one that names a core when the shell\'s version is not known, or names something that is no version; a core that is new enough takes it, and an archive that names none is taken as before',
            refused(tooNew, /needs a newer core than this copy has/) && refused(noShell, /needs a newer core/) && junkNeeds.every(r => refused(r, /needs a newer core/)) && [enough, exact, nullNeeds].every(r => !r.err && r.res && r.res.ok === true && verOf(r.inst.app) === '1.5.1')
            && tooNew.info.canHotUpdate === true && tooNew.info.minShell === null, why([tooNew, noShell].concat(junkNeeds, [enough, exact, nullNeeds])));
        {   // through the route: the shell's own version is what the archive's word is held against
            const inst = install('1.5.0'), before = tree(inst.root);
            const h = updater.makeHandler({ repo: 'o/r', currentVersion: '1.5.0', shellVersion: '1.5.0', systemDir: inst.sys, apiUrl: publish({ tag: '1.5.1', zip: needs('1.5.1') }), pubKey: PUB });
            const r = { code: 0, body: '', writeHead(c) { r.code = c; }, end(b) { r.body = String(b || ''); } };
            await within(h({ method: 'POST' }, r, new URL('/api/update-apply', 'http://localhost')), 60000, 'apply');
            const inst2 = install('1.5.0');
            const h2 = updater.makeHandler({ repo: 'o/r', currentVersion: '1.5.0', shellVersion: '1.5.0', systemDir: inst2.sys, apiUrl: publish({ tag: '1.5.1', zip: needs('1.5.0') }), pubKey: PUB });
            const r2 = { code: 0, body: '', writeHead(c) { r2.code = c; }, end(b) { r2.body = String(b || ''); } };
            await within(h2({ method: 'POST' }, r2, new URL('/api/update-apply', 'http://localhost')), 60000, 'apply');
            check('the apply route holds a signed archive to the shell\'s own version: one that needs a newer core answers 500 with that reason and changes nothing; one that needs the core this shell is applies', r.code === 500 && /needs a newer core/.test(r.body) && tree(inst.root) === before && r2.code === 200 && verOf(inst2.app) === '1.5.1', j([r.code, r.body, r2.code, r2.body]));
        }
        const noKey = await attempt({ tag: '1.5.1', pubKey: '' }), nullKey = await attempt({ tag: '1.5.1', pubKey: null }), dflt = await attempt({ tag: '1.5.1', noKeyOpt: true });
        check('with no public key configured nothing is taken: an empty key, no key, and the shell\'s own key (empty until the owner makes one; never this suite\'s) each refuse a release signed here', refused(noKey) && refused(nullKey) && refused(dflt), why([noKey, nullKey, dflt]));
        const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'pem' });
        const badKeys = []; for (const k of [rsa, 'not a key', '-----BEGIN PUBLIC KEY-----\nAAAA\n-----END PUBLIC KEY-----\n', 42, {}, [PUB]]) badKeys.push(await attempt({ tag: '1.5.1', pubKey: k }));
        check('a configured key that is not an Ed25519 public key in PEM (an RSA key, words, a broken PEM, a number, an object, a list) refuses every update rather than throwing something else', badKeys.every(r => refused(r)), why(badKeys));
        const realSig = sign('waypoint-app-1.5.1.zip', sha256(zA), '1.5.1'), raw = Buffer.from(realSig, 'base64');
        const badSigs = []; for (const s of ['', 'not base64 at all', raw.slice(0, 32).toString('base64'), Buffer.concat([raw, raw]).toString('base64'), realSig + 'AAAA', raw.toString('hex'), realSig.replace(/=+$/, ''), '{"sig":"' + realSig + '"}', Buffer.alloc(1 << 20, 65)])
            badSigs.push(await attempt({ tag: '1.5.1', zip: zA, sigText: s }));
        const okSigs = []; for (const s of [realSig, realSig + NL, '  ' + realSig + '\r\n']) okSigs.push(await attempt({ tag: '1.5.1', zip: zA, sigText: s }));
        check('a .sig that is not the base64 of exactly 64 bytes (empty, words, 32 bytes, 128 bytes, trailing characters, hex, its padding cut, wrapped in JSON, a megabyte of filler) is refused, the install untouched; the same signature with or without a line end is taken',
            badSigs.every(r => !!r.err && !r.res && r.same) && badSigs.slice(0, 8).every(r => refused(r)) && okSigs.every(r => !r.err && r.res && r.res.ok && verOf(r.inst.app) === '1.5.1'), why(badSigs.concat(okSigs)));
        const tagBad = []; for (const t of ['1.5.1\n1.5.2', '../1.5.1', '1.5.1 ']) { const z = appZip('1.5.1'); tagBad.push(await attempt({ tag: t, zip: z, zipName: 'waypoint-app-' + t.trim() + '.zip', sigText: sign('waypoint-app-' + t.trim() + '.zip', sha256(z), t) + NL })); }
        check('a release whose version is not a plain version (a line break in it, a path, a trailing space the name lacks) is refused whatever is signed', tagBad.every(r => !!r.err && !r.res && r.same), why(tagBad));

        /* ---- the guards the updater already had ---- */
        const noSha = await attempt({ tag: '1.5.1', noSha: true });
        const badSha = []; for (const s of ['', 'zz', sha256(zA).slice(0, 40), 'sha256: ' + sha256(zA)]) badSha.push(await attempt({ tag: '1.5.1', zip: zA, shaText: s }));
        check('still refused as before: a release with no checksum ("no checksum published") and a checksum that is not 64 hex digits (empty, words, cut short, prefixed) — the install untouched',
            refused(noSha, /^no checksum published for this update — refused$/) && badSha.every(r => refused(r, /^unreadable checksum — update aborted$/)), why([noSha].concat(badSha)));
        const upper = await attempt({ tag: '1.5.1', zip: zA, shaText: sha256(zA).toUpperCase() + NL });
        check('a checksum published in upper case is read as the same digest (the signed words are the lower-case hex)', !upper.err && upper.res && upper.res.ok === true, why(upper));
        const hostile = [{ name: '../wpEvil1.txt', data: 'x' }, { name: '../../wpEvil2.txt', data: 'x' }, { name: '../../../wpEvil3.txt', data: 'x' }, { name: '/wpEvil4.txt', data: 'x' }, { name: 'C:/wpEvil5.txt', data: 'x' }, { name: 'a/../../wpEvil6.txt', data: 'x' }, { name: '..' + String.fromCharCode(92) + 'wpEvil7.txt', data: 'x' }, { name: 'scripts/ok.js', data: '// fine' }];
        const esc = await attempt({ tag: '1.5.1', zip: appZip('1.5.1', hostile) });
        const strays = []; (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (/wpEvil/.test(f)) strays.push(path.relative(tmp, p)); if (fs.statSync(p).isDirectory()) walk(p); } })(tmp);
        const inApp = path.relative(tmp, esc.inst.app);
        check('an archive entry that names a path outside the app folder (dot-dot segments, with a backslash, an absolute path, a drive) writes nothing outside it: the rest of a signed update lands, no stray file anywhere in or above the install',
            !esc.err && esc.res && esc.res.ok === true && fs.existsSync(path.join(esc.inst.app, 'scripts', 'ok.js')) && strays.every(s => s.startsWith(inApp + path.sep)) && j(fs.readdirSync(esc.inst.sys).sort()) === j(['app', 'app.prev']) && j(fs.readdirSync(esc.inst.root).sort()) === j(['saves', 'system']), j([esc.err, strays]));
        const emptyZip = await attempt({ tag: '1.5.1', zip: zip([]) }), noIndex = await attempt({ tag: '1.5.1', zip: zip([{ name: 'version.json', data: '{"version":"1.5.1"}' }]) }), notZip = await attempt({ tag: '1.5.1', zip: Buffer.from('this is no archive at all, only words that happen to be signed') });
        check('a signed file that is not the app is still refused, the install untouched: an empty archive, one with no index.html, bytes that are no zip', refused(emptyZip, /empty update archive/) && refused(noIndex, /no index\.html/) && refused(notZip, /not a zip file/), why([emptyZip, noIndex, notZip]));
        const prefixed = await attempt({ tag: '1.5.1', zip: zip([{ name: 'app/index.html', data: '<!doctype html><title>new 1.5.1</title>' }, { name: 'app/version.json', data: '{"version":"1.5.1"}' }, { name: 'app/scripts/main.js', data: '// new' }]) });
        check('an archive that holds the app under one leading folder is unpacked without it, as before, and its version.json is read from there', !prefixed.err && prefixed.res && prefixed.res.ok && verOf(prefixed.inst.app) === '1.5.1' && fs.existsSync(path.join(prefixed.inst.app, 'scripts', 'main.js')), why(prefixed));
        {   // the size caps, for real: an entry that inflates past 256 MB, and a download past 200 MB
            const BIG = 256 * 1024 * 1024 + 1; let bombRaw = zlib.deflateRawSync(Buffer.alloc(BIG), { level: 1 });
            const bomb = await attempt({ tag: '1.5.1', zip: appZip('1.5.1', [{ name: 'assets/big.bin', raw: bombRaw, usize: BIG }]) }); bombRaw = null;
            check('an entry that would inflate past 256 MB stops the update at the cap: nothing swapped, app.new removed, the install untouched', !!bomb.err && !bomb.res && bomb.same, why(bomb));
            const fakeDigest = sha256(Buffer.from('never downloaded whole')), chunk = Buffer.alloc(1 << 20);
            const flood = (req, res) => { res.writeHead(200); let sent = 0, open = true; res.on('close', () => { open = false; }); const pump = () => { while (open && sent < 202) { sent++; if (!res.write(chunk)) { res.once('drain', pump); return; } } if (open) res.end(); }; pump(); };
            const huge = await attempt({ tag: '1.5.1', served: flood, shaText: fakeDigest + NL, sigText: sign('waypoint-app-1.5.1.zip', fakeDigest, '1.5.1') + NL });
            check('a download that runs past 200 MB is cut off ("download too large"), the install untouched', refused(huge, /download too large/), why(huge));
        }
        {   // the swap put back when its second half fails (a rename the disk refuses)
            const inst = install('1.5.0'), before = tree(inst.sys), api = publish({ tag: '1.5.1' }), info = await within(updater.checkForUpdate({ repo: 'o/r', currentVersion: '1.5.0', shellVersion: '1.5.0', apiUrl: api }), 60000, 'check');
            const real = fs.renameSync; let n = 0, err = null;
            fs.renameSync = function(a, b) { n++; if (n === 2) { const e = new Error('EPERM: the folder is in use'); e.code = 'EPERM'; throw e; } return real.apply(fs, arguments); };
            try { await updater.applyAppUpdate({ systemDir: inst.sys, appZip: info.appZip, appZipName: info.appZipName, sha256: info.sha256, sig: info.sig, version: info.latest, pubKey: PUB }); } catch (e) { err = String(e.message); } finally { fs.renameSync = real; }
            check('a swap whose second rename fails puts the old app back where it was and leaves no half-made folder behind', /EPERM/.test(String(err)) && n >= 3 && verOf(inst.app) === '1.5.0' && !fs.existsSync(path.join(inst.sys, 'app.new')) && !fs.existsSync(path.join(inst.sys, 'app.prev')) && tree(inst.sys) === before, j([err, n, fs.readdirSync(inst.sys)]));
        }

        /* ---- what a check offers ---- */
        const iNoSig = await look({ tag: '1.5.1', noSig: true }), iNoSha = await look({ tag: '1.5.1', noSha: true }), iAll = await look({ tag: '1.5.1' });
        const iNoZip = await look({ tag: '1.5.1', noZip: true, installer: true }), iShell = await look({ tag: '1.5.1', manifest: { version: '1.5.1', minShell: '1.5.1' }, installer: true }), iShellOk = await look({ tag: '1.5.1', manifest: { version: '1.5.1', minShell: '1.1.2' } });
        const iSame = await look({ tag: '1.5.0' }), iOlder = await look({ tag: '1.4.9' });
        check('a one-click update is on offer only when the release carries a zip, its checksum AND its signature and the shell is new enough: without the signature or the checksum it is not, and the signature\'s address is null',
            iAll.canHotUpdate === true && iShellOk.canHotUpdate === true && iNoSig.canHotUpdate === false && iNoSig.sig === null && iNoSha.canHotUpdate === false && iNoSha.sha256 === null && iShell.canHotUpdate === false && iNoZip.canHotUpdate === false, j([iAll.canHotUpdate, iNoSig.canHotUpdate, iNoSig.sig, iNoSha.canHotUpdate, iShell.canHotUpdate]));
        check('the installer is called for as before: a release with no zip or one that needs a newer shell says so and names its installer; a release this shell can take does not; a release that is not newer offers nothing at all',
            iNoZip.needsInstaller === true && /Waypoint_Setup\.exe$/.test(String(iNoZip.installer)) && iShell.needsInstaller === true && iShell.minShell === '1.5.1' && iAll.needsInstaller === false && iNoSig.needsInstaller === false
            && iSame.newer === false && iSame.canHotUpdate === false && iSame.needsInstaller === false && iOlder.newer === false && iOlder.canHotUpdate === false, j([iNoZip.needsInstaller, iShell.needsInstaller, iAll.needsInstaller, iNoSig.needsInstaller, iSame.newer, iOlder.newer]));
        check('the words that are signed: the zip\'s name, the lower-case digest and the version, each ended by a line feed — and verifyUpdate takes exactly a signature over them',
            typeof updater.signedText === 'function' && updater.signedText('waypoint-app-1.5.1.zip', 'ab'.repeat(32), '1.5.1') === 'waypoint-app-1.5.1.zip' + NL + 'ab'.repeat(32) + NL + '1.5.1' + NL
            && typeof updater.verifyUpdate === 'function' && updater.verifyUpdate(PUB, 'waypoint-app-1.5.1.zip', sha256(zA), '1.5.1', realSig) === true && updater.verifyUpdate(PUB2, 'waypoint-app-1.5.1.zip', sha256(zA), '1.5.1', realSig) === false
            && updater.verifyUpdate(PUB, 'waypoint-app-1.5.1.zip', sha256(zA), '1.5.2', realSig) === false && updater.verifyUpdate(PUB, 'waypoint-app-1.5.2.zip', sha256(zA), '1.5.1', realSig) === false && updater.verifyUpdate('', 'waypoint-app-1.5.1.zip', sha256(zA), '1.5.1', realSig) === false);

        /* ================= B. the way back ================= */
        const rb = typeof updater.rollbackAppUpdate === 'function' ? updater.rollbackAppUpdate : () => { throw new Error('updater.js has no rollbackAppUpdate'); };
        const tryRb = o => { try { return { res: rb(o) }; } catch (e) { return { err: String(e && e.message || e) }; } };
        {
            const inst = install('1.5.0'), appBefore = tree(inst.app), savesBefore = tree(path.join(inst.root, 'saves'));
            const info = await look({ tag: '1.5.1' });
            await updater.applyAppUpdate({ systemDir: inst.sys, appZip: info.appZip, appZipName: info.appZipName, sha256: info.sha256, sig: info.sig, version: info.latest, pubKey: PUB });
            const mid = verOf(inst.app), r = tryRb({ systemDir: inst.sys, shellVersion: '1.5.0' });
            check('Restore: after an update, rollbackAppUpdate puts app.prev back as the app exactly as it was (every file, byte for byte), reports its version, leaves no app.prev, app.bad or app.new, and never touches the saves beside it',
                mid === '1.5.1' && r.res && r.res.ok === true && r.res.version === '1.5.0' && tree(inst.app) === appBefore && j(fs.readdirSync(inst.sys).sort()) === j(['app']) && tree(path.join(inst.root, 'saves')) === savesBefore, j([mid, r]));
            const again = tree(inst.root), r2 = tryRb({ systemDir: inst.sys, shellVersion: '1.5.0' });
            check('Restore refuses when there is no previous version (a second restore, a fresh install): the install untouched', !!r2.err && !r2.res && tree(inst.root) === again, r2);
        }
        {
            const mk = (cur, prev, o) => { const inst = install(cur), p = path.join(inst.sys, 'app.prev'); fs.mkdirSync(p, { recursive: true }); if (!(o && o.noIndex)) fs.writeFileSync(path.join(p, 'index.html'), 'prev'); if (prev !== undefined) fs.writeFileSync(path.join(p, 'version.json'), typeof prev === 'string' && prev[0] === '{' ? prev : JSON.stringify({ version: prev })); return inst; };
            const a = mk('1.5.1', '1.5.0', { noIndex: true }), aT = tree(a.root), aR = tryRb({ systemDir: a.sys, shellVersion: '1.5.0' });
            const b = mk('1.5.0', '1.4.9'), bT = tree(b.root), bR = tryRb({ systemDir: b.sys, shellVersion: '1.5.0' });
            const c = mk('1.5.1', undefined), cT = tree(c.root), cR = tryRb({ systemDir: c.sys, shellVersion: '1.5.0' });
            const d = mk('1.5.1', '{"version":"<img src=x onerror=alert(1)>"}'), dT = tree(d.root), dR = tryRb({ systemDir: d.sys, shellVersion: '1.5.0' });
            const e = mk('1.5.2', '1.5.1'), eR = tryRb({ systemDir: e.sys, shellVersion: '1.5.0' });
            check('Restore refuses a previous folder that is not an app this shell can vouch for — no index.html in it, a version older than the shell itself (a copy left from before the installer ran), no version.json, a version that is no plain version — the install untouched each time; a previous version at or above the shell\'s is restored',
                !!aR.err && tree(a.root) === aT && !!bR.err && tree(b.root) === bT && !!cR.err && tree(c.root) === cT && !!dR.err && tree(d.root) === dT && eR.res && eR.res.ok === true && eR.res.version === '1.5.1' && verOf(e.app) === '1.5.1', j([aR, bR, cR, dR, eR]));
            const pi = typeof updater.prevInfo === 'function' ? updater.prevInfo : () => ({});
            const f = mk('1.5.2', '1.5.1');
            check('what the shell says of the previous version: hasPrev true with its version only when a restore would be taken; an older-than-the-shell copy is named but not offered; a version that is no plain version is never passed on',
                j(pi(f.sys, '1.5.0')) === j({ hasPrev: true, prevVersion: '1.5.1' }) && j(pi(b.sys, '1.5.0')) === j({ hasPrev: false, prevVersion: '1.4.9' }) && j(pi(d.sys, '1.5.0')) === j({ hasPrev: false, prevVersion: null }) && j(pi(install('1.5.0').sys, '1.5.0')) === j({ hasPrev: false, prevVersion: null }) && j(pi(a.sys, '1.5.0')) === j({ hasPrev: false, prevVersion: '1.5.0' }),
                j([pi(f.sys, '1.5.0'), pi(b.sys, '1.5.0'), pi(d.sys, '1.5.0'), pi(a.sys, '1.5.0')]));
            const g = mk('1.5.2', '1.5.1'), gT = tree(g.root), real = fs.renameSync; let n = 0, gErr = null;
            fs.renameSync = function() { n++; if (n === 2) { const er = new Error('EPERM: the folder is in use'); er.code = 'EPERM'; throw er; } return real.apply(fs, arguments); };
            try { rb({ systemDir: g.sys, shellVersion: '1.5.0' }); } catch (er) { gErr = String(er.message); } finally { fs.renameSync = real; }
            check('a restore whose second rename fails puts the current app back where it was: the install as before, app.prev still there to try again', /EPERM/.test(String(gErr)) && n >= 3 && tree(g.root) === gT, j([gErr, n, fs.readdirSync(g.sys)]));
        }
        /* ================= B2. the outside sheet reader's folder (system/app/private) across an update and a restore =================
           The owner, 1.5.9, by prompt: "The update keeps it". The folder is no part of a release: the maintainer copies it in by hand,
           and an update or a restore replaces the whole app folder, so the shell carries it across, a real folder only and bounded. */
        {
            const upd = async (inst, tag, zipBuf) => { const info = await look(zipBuf ? { tag, zip: zipBuf } : { tag }); try { return { res: await within(updater.applyAppUpdate({ systemDir: inst.sys, appZip: info.appZip, appZipName: info.appZipName, sha256: info.sha256, sig: info.sig, version: info.latest, pubKey: PUB }), 120000, 'apply') }; } catch (e) { return { err: String(e && e.message || e) }; } };
            const fill = dir => { fs.mkdirSync(path.join(dir, 'lib', 'deep'), { recursive: true }); fs.writeFileSync(path.join(dir, 'index.js'), 'export const reader = 1;' + NL); fs.writeFileSync(path.join(dir, 'lib', 'deep', 'data.bin'), crypto.randomBytes(70000)); fs.writeFileSync(path.join(dir, 'lib', 'style.css'), '.x{}'); fs.mkdirSync(path.join(dir, 'empty')); };
            // an install with a reader: kept byte for byte by the update, and by the restore after it
            const a = install('1.5.0'), aPriv = path.join(a.app, 'private'); fill(aPriv); const aTree = tree(aPriv);
            const aU = await upd(a, '1.5.1');
            check('an update keeps the outside sheet reader the maintainer added: the new app holds system/app/private byte for byte, every folder too (an empty one among them), the old app keeps its own in app.prev, nothing else is left beside the app, and the answer says private: kept with no note',
                !!aU.res && aU.res.ok === true && aU.res.private === 'kept' && !('privateNote' in aU.res) && verOf(a.app) === '1.5.1' && tree(path.join(a.app, 'private')) === aTree && tree(path.join(a.sys, 'app.prev', 'private')) === aTree && j(fs.readdirSync(a.sys).sort()) === j(['app', 'app.prev']), j([aU, fs.readdirSync(a.sys)]));
            fs.writeFileSync(path.join(a.app, 'private', 'newer.js'), '// copied in again after the update' + NL); const aTree2 = tree(path.join(a.app, 'private'));
            const aR = tryRb({ systemDir: a.sys, shellVersion: '1.5.0' });
            check('a restore keeps the reader of the app it goes back from: the app that comes back holds the private folder as it stood in the app in use (a file added after the update included), byte for byte, with no carry folder left behind, and the answer says private: kept',
                !!aR.res && aR.res.ok === true && aR.res.private === 'kept' && verOf(a.app) === '1.5.0' && tree(path.join(a.app, 'private')) === aTree2 && j(fs.readdirSync(a.sys).sort()) === j(['app']) && !fs.existsSync(path.join(a.app, 'private.carry')), j([aR, fs.readdirSync(a.sys), fs.readdirSync(a.app)]));
            // an install with none: as before
            const b = install('1.5.0'), bU = await upd(b, '1.5.1');
            check('an install with no private folder updates as before: the new app holds none, the answer says private: none with no note',
                !!bU.res && bU.res.ok === true && bU.res.private === 'none' && !('privateNote' in bU.res) && !fs.existsSync(path.join(b.app, 'private')), j(bU));
            const bR = tryRb({ systemDir: b.sys, shellVersion: '1.5.0' });
            check('a restore with no private folder in use leaves the app that comes back as it was, and says private: none', !!bR.res && bR.res.private === 'none' && !fs.existsSync(path.join(b.app, 'private')), j(bR));
            // a link or a junction named private, or one inside it, is never followed
            const out = path.join(tmp, 'outside-' + (++seq)); fill(out); const outTree = tree(out);
            const c = install('1.5.0'); let linked = true; try { fs.symlinkSync(out, path.join(c.app, 'private'), 'junction'); } catch (e) { linked = false; }
            if (linked) {
                const cU = await upd(c, '1.5.1');
                check('a link or a junction named private is never followed: the update applies, the new app holds no private folder, the answer says private: left with its note in plain words, and what the link pointed at is untouched',
                    !!cU.res && cU.res.ok === true && verOf(c.app) === '1.5.1' && cU.res.private === 'left' && /not carried over/.test(String(cU.res.privateNote)) && !fs.existsSync(path.join(c.app, 'private')) && tree(out) === outTree, j(cU));
            } else check('a junction could be made on this machine for the link case', false, 'symlinkSync refused');
            const d = install('1.5.0'), dPriv = path.join(d.app, 'private'); fill(dPriv); let inner = true; try { fs.symlinkSync(out, path.join(dPriv, 'lib', 'away'), 'junction'); } catch (e) { inner = false; }
            if (inner) {
                const dU = await upd(d, '1.5.1');
                check('a private folder that holds a link anywhere inside it is not carried at all: the update applies, the new app holds no private folder, the answer says private: left, and what the link pointed at is untouched',
                    !!dU.res && dU.res.ok === true && dU.res.private === 'left' && !fs.existsSync(path.join(d.app, 'private')) && tree(out) === outTree, j(dU));
            } else check('a junction could be made on this machine for the inner link case', false, 'symlinkSync refused');
            // past the bounds the update still applies, without it
            const e = install('1.5.0'), ePriv = path.join(e.app, 'private'); fs.mkdirSync(ePriv); for (let i = 0; i <= updater.PRIVATE_FILES; i++) fs.writeFileSync(path.join(ePriv, 'f' + i + '.txt'), 'x');
            const eU = await upd(e, '1.5.1');
            const f = install('1.5.0'), fPriv = path.join(f.app, 'private'); fs.mkdirSync(fPriv); const fd = fs.openSync(path.join(fPriv, 'big.bin'), 'w'); fs.ftruncateSync(fd, updater.PRIVATE_BYTES + 1); fs.closeSync(fd);
            const fU = await upd(f, '1.5.1');
            check('past the bounds (2,000 files, 64 MB) the update still applies and the answer says the private folder was not carried: private: left with its note, the new app holds none, app.new gone',
                updater.PRIVATE_FILES === 2000 && updater.PRIVATE_BYTES === 64 * 1024 * 1024 && [[e, eU], [f, fU]].every(([i, r]) => !!r.res && r.res.ok === true && verOf(i.app) === '1.5.1' && r.res.private === 'left' && /copy it into the app again/.test(String(r.res.privateNote)) && !fs.existsSync(path.join(i.app, 'private')) && !fs.existsSync(path.join(i.sys, 'app.new'))), j([eU, fU]));
            // an archive that brings a private folder of its own is malformed
            const g = install('1.5.0'), gPriv = path.join(g.app, 'private'); fill(gPriv); const gT = tree(g.root);
            const gU = await upd(g, '1.5.1', appZip('1.5.1', [{ name: 'private/index.js', data: 'export const bad = 1;' }]));
            const h = install('1.5.0'), hT = tree(h.root), hU = await upd(h, '1.5.1', appZip('1.5.1', [{ name: 'Private./x.js', data: 'x' }]));
            check('an update archive that holds a private folder of its own, in any letter case or with a trailing dot, is refused as malformed: nothing unpacked, nothing swapped, the install and its own reader untouched',
                [[gU, g, gT], [hU, h, hT]].every(([r, i, t]) => !r.res && /holds a private folder/.test(String(r.err)) && tree(i.root) === t), j([gU, hU]));
        }
        {   // the installer leaves the folder alone when it updates in place: it removes nothing under system\app, and only a clean install wipes the program files
            const iss = read('installer.iss');
            check('the installer\'s update in place deletes nothing under system\\app (no InstallDelete section, no Excludes naming private), so an installer run keeps the reader too; only a clean install wipes the program files',
                !/^\[InstallDelete\]/m.test(iss) && !/private/i.test((/Excludes: "([^"]*)"/.exec(iss) || [])[1] || 'private') && /InstallMode\(\) = 1\) then\s*\n\s*WipeProgramFiles/.test(iss));
            const help = read('system/app/index.html'), notesA = read('WHATSNEW.txt'), notesB = read('system/app/assets/whatsnew.txt');
            const top = t => t.slice(t.indexOf('WAYPOINT 1.5.9'), t.indexOf('WAYPOINT 1.5.8'));   // 1.5.9's own part, wherever a later release put its notes above it
            check('Help\'s Updates part and both release notes of 1.5.9 say that an update keeps an outside sheet reader, that a restore keeps it too, and the notes that this release changes the core and so installs through the installer once',
                /<li><b>An outside sheet reader<\/b> you added to the app folder stays through an update\. Restore the previous version keeps it too\./.test(help)
                && [notesA, notesB].every(t => /(^|\n)WAYPOINT 1\.5\.9/.test(t) && /An update keeps an outside sheet reader you added to the app folder\./.test(top(t)) && /Restore the previous version\s+keeps it too\./.test(top(t)) && /This release changes Waypoint's core[\s\S]{0,120}installer once\./.test(top(t))));
        }
        {   // the three routes, through the handler both servers mount, with the shell's own appVersion (sliced from main.js) as the version reported
            const mainSrc = read('system/resources/app/main.js'), avA = mainSrc.indexOf('function appVersion() {'), avB = mainSrc.indexOf('const updateCfg = {');
            const inst = install('1.5.0'), appBefore = tree(inst.app), savesBefore = tree(path.join(inst.root, 'saves'));
            const appVersion = new Function('SHELL_VERSION', 'fs', 'path', 'rootDir', 'updater', mainSrc.slice(avA, avB) + NL + 'return appVersion;')('1.5.0', fs, path, inst.root, updater);
            const unsignedApi = publish({ tag: '1.5.1', key: K2.privateKey }), signedApi = publish({ tag: '1.5.1' });
            const cfg = { repo: 'owner/repo', shellVersion: '1.5.0', systemDir: inst.sys, apiUrl: unsignedApi, pubKey: PUB };
            Object.defineProperty(cfg, 'currentVersion', { get: appVersion, enumerable: true });
            const handle = updater.makeHandler(cfg);
            const hs = http.createServer(async (req, res) => { let done = false; try { done = await handle(req, res, new URL(req.url, 'http://localhost')); } catch (e) { done = false; } if (!done) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{"unrouted":true}'); } });
            await new Promise(r => hs.listen(0, '127.0.0.1', r)); hs.unref();
            const call = (method, p, body) => within(new Promise(resolve => {
                const req = http.request({ host: '127.0.0.1', port: hs.address().port, method, path: p, agent: false, headers: body ? { 'Content-Type': 'application/json' } : {} }, res => { const bufs = []; res.on('data', b => bufs.push(b)); res.on('end', () => { let json = null; try { json = JSON.parse(Buffer.concat(bufs).toString('utf8')); } catch (e) {} resolve({ code: res.statusCode, json }); }); });
                req.on('error', e => resolve({ code: 0, json: null, err: String(e && e.code) }));
                req.setTimeout(60000, () => req.destroy(new Error('no answer')));
                if (body) req.write(body); req.end();
            }), 90000, method + ' ' + p);
            const c0 = await call('GET', '/api/update-check?force=1');
            const a0 = await call('POST', '/api/update-apply', JSON.stringify({ pubKey: PUB2, sig: 'x', sha256: 'x', appZip: 'x' }));
            check('the apply route refuses a release signed with another key (500, "unsigned update — refused") whatever the request\'s body says — the page cannot hand the shell a key — and the install is untouched',
                c0.code === 200 && c0.json.canHotUpdate === true && c0.json.hasPrev === false && c0.json.prevVersion === null && c0.json.current === '1.5.0' && a0.code === 500 && a0.json.ok === false && REFUSED.test(String(a0.json.error)) && tree(inst.app) === appBefore && !fs.existsSync(path.join(inst.sys, 'app.prev')), j([c0.json, a0]));
            cfg.apiUrl = signedApi;
            const a1 = await call('POST', '/api/update-apply'), c1 = await call('GET', '/api/update-check');
            check('the apply route takes the signed release; the check then reports the new version as current, nothing newer, and a previous version to go back to (hasPrev, prevVersion)',
                a1.code === 200 && a1.json.ok === true && a1.json.version === '1.5.1' && verOf(inst.app) === '1.5.1' && c1.json.current === '1.5.1' && c1.json.newer === false && c1.json.hasPrev === true && c1.json.prevVersion === '1.5.0', j([a1, c1.json]));
            const g0 = await call('GET', '/api/update-rollback'), r1 = await call('POST', '/api/update-rollback'), c2 = await call('GET', '/api/update-check');
            check('the restore route (POST only) puts the previous version back: the app exactly as it was, the saves untouched; the version reported is the restored one; the newer release is on offer again and nothing applies it by itself; there is no previous version any more',
                g0.code === 404 && r1.code === 200 && r1.json.ok === true && r1.json.version === '1.5.0' && tree(inst.app) === appBefore && tree(path.join(inst.root, 'saves')) === savesBefore && c2.json.current === '1.5.0' && c2.json.latest === '1.5.1' && c2.json.newer === true && c2.json.canHotUpdate === true
                && c2.json.hasPrev === false && c2.json.prevVersion === null && verOf(inst.app) === '1.5.0' && j(fs.readdirSync(inst.sys).sort()) === j(['app']), j([g0.code, r1, c2.json]));
            const r2 = await call('POST', '/api/update-rollback'), still = tree(inst.app) === appBefore;
            check('a restore with nothing to restore answers 500 with ok false and changes nothing', r2.code === 500 && r2.json.ok === false && typeof r2.json.error === 'string' && still, r2);
            await call('POST', '/api/update-apply'); cfg.apiUrl = base + '/r0/latest';   // updated again, then the release list unreachable
            const c3 = await call('GET', '/api/update-check?force=1');
            check('with the release list unreachable the check still says whether there is a previous version to restore (a way back needs no network)', c3.code === 200 && typeof c3.json.error === 'string' && c3.json.hasPrev === true && c3.json.prevVersion === '1.5.0' && c3.json.current === '1.5.1', c3.json);
            try { hs.close(); } catch (e) {}
        }
        {
            const main = read('system/resources/app/main.js'), dev = read('tools/dev-server.js');
            const routed = s => /if \(updater\.UPDATE_ROUTES\.includes\(url\.pathname\)\) \{\s*updateHandler\(req, res, url\);\s*return;\s*\}/.test(s);
            const after = s => s.indexOf('updater.UPDATE_ROUTES.includes(url.pathname)') > s.indexOf('if (!localRequest(req))') && s.indexOf('if (!localRequest(req))') > 0;
            check('the shell and the dev server send the updater\'s own list of paths (UPDATE_ROUTES: the check, apply, the restore and the four installer routes) to its handler, alike, behind the local-request gate, naming no update path of their own, and neither hands it a key of its own (the key is the shell file\'s)',
                routed(main) && routed(dev) && after(main) && after(dev) && !/pubKey/.test(main) && !/pubKey/.test(dev) && !/\/api\/update-/.test(main) && !/'\/api\/update-/.test(dev)
                && j(updater.UPDATE_ROUTES) === j(['/api/update-check', '/api/update-apply', '/api/update-rollback', '/api/update-installer', '/api/update-installer-status', '/api/update-installer-run', '/api/update-installer-dismiss']), j(updater.UPDATE_ROUTES));
        }

        /* ================= D. an update that changes the core: the shell fetches, checks and starts the installer ================= */
        const dl = updater.downloadInstaller || (() => Promise.reject(new Error('updater.js has no downloadInstaller')));
        const runInst = updater.runInstaller || (() => Promise.reject(new Error('updater.js has no runInstaller')));
        // look a release up (as an install that may run an installer) and download its installer into a fresh folder, as the shell's route does
        async function fetchSetup(spec, o) {
            o = o || {};
            const api = publish(Object.assign({ tag: '1.5.1', noZip: true }, spec)), dir = fs.mkdtempSync(path.join(tmp, 'dl-')), prog = [];
            let info = null, res = null, err = null, verified = 0;
            try {
                info = await within(updater.checkForUpdate({ repo: 'o/r', currentVersion: '1.5.0', shellVersion: '1.5.0', apiUrl: api, selfInstall: true, pubKey: PUB }), 60000, 'check');
                const opts = { url: info.installer, sigUrl: info.installerSig, version: 'version' in o ? o.version : info.latest, dir, onProgress: (g, t) => prog.push([g, t]), onVerify: () => { verified++; } };
                if (!o.noKeyOpt) opts.pubKey = 'pubKey' in o ? o.pubKey : PUB;
                if (o.maxBytes) opts.maxBytes = o.maxBytes;
                res = await within(dl(opts), 120000, 'download');
            } catch (e) { err = String(e && e.message || e); }
            return { api, dir, info, res, err, prog, verified, left: fs.readdirSync(dir), asked: hitsOf(api, SETUP_NAME) };
        }
        const nothing = (r, re) => !!r.err && !r.res && (re || REFUSED).test(r.err) && r.left.length === 0;
        const whyD = rs => j([].concat(rs).map(r => [r.err, r.left, r.asked]));
        {
            const ok = await fetchSetup({ setup: {} });
            const last = ok.prog[ok.prog.length - 1] || [];
            check('a signed installer downloads to a file: it lands under its final name (Waypoint_Setup-<version>.exe) only once its signature checks, byte for byte what the release holds, with its digest and version reported, the progress told as it comes (bytes so far, of the stated length), and no .part left',
                !ok.err && !!ok.res && ok.res.version === '1.5.1' && ok.res.sha256 === sha256(SETUP) && ok.res.file === path.join(ok.dir, 'Waypoint_Setup-1.5.1.exe') && j(ok.left) === j(['Waypoint_Setup-1.5.1.exe']) && fs.readFileSync(ok.res.file).equals(SETUP)
                && ok.prog.length >= 1 && last[0] === SETUP.length && last[1] === SETUP.length && ok.prog.every((p, n) => n === 0 || p[0] > ok.prog[n - 1][0]) && ok.verified === 1 && ok.asked === 1, j([ok.err, ok.left, ok.prog.length, last]));
            check('what a check reports of a release that needs the installer: the installer\'s address, its signature\'s address beside it, its size as the release lists it, and that this copy can install it by itself',
                !!ok.info && ok.info.needsInstaller === true && /Waypoint_Setup\.exe$/.test(String(ok.info.installer)) && /Waypoint_Setup\.exe\.sig$/.test(String(ok.info.installerSig)) && ok.info.installerSize === SETUP.length && ok.info.canSelfInstall === true && ok.info.canHotUpdate === false, ok.info);

            const noSig = await fetchSetup({ setup: { noSig: true } });
            const otherKey = await fetchSetup({ setup: { key: K2.privateKey } });
            check('an installer with no signature beside it, or one signed with another key, is refused ("unsigned update — refused") with nothing left in the folder: no file, no .part', nothing(noSig) && noSig.asked === 0 && nothing(otherKey), whyD([noSig, otherKey]));
            // the same digest and the same version, signed under the other asset's name
            const asZip = await fetchSetup({ setup: { sigText: sign('waypoint-app-1.5.1.zip', sha256(SETUP), '1.5.1') + NL } });
            const zB = appZip('1.5.1'), asSetup = await attempt({ tag: '1.5.1', zip: zB, sigText: sign(SETUP_NAME, sha256(zB), '1.5.1') + NL });
            check('the name is part of what is signed: a signature made over the app zip\'s name never passes for the installer\'s (same bytes, same version), and one made over the installer\'s name never passes for the zip\'s — each refused, nothing left, the install untouched',
                nothing(asZip) && refused(asSetup) && updater.INSTALLER_NAME === SETUP_NAME
                && updater.verifyUpdate(PUB, SETUP_NAME, sha256(SETUP), '1.5.1', sign(SETUP_NAME, sha256(SETUP), '1.5.1')) === true && updater.verifyUpdate(PUB, SETUP_NAME, sha256(SETUP), '1.5.1', sign('waypoint-app-1.5.1.zip', sha256(SETUP), '1.5.1')) === false
                && updater.verifyUpdate(PUB, 'waypoint-app-1.5.1.zip', sha256(SETUP), '1.5.1', sign(SETUP_NAME, sha256(SETUP), '1.5.1')) === false, whyD([asZip]).concat(why(asSetup)));
            const otherVer = await fetchSetup({ tag: '1.5.2', setup: { sigText: sign(SETUP_NAME, sha256(SETUP), '1.5.1') + NL } });
            const changedBytes = Buffer.concat([SETUP, Buffer.from('one more byte')]);
            const altered = await fetchSetup({ setup: { served: changedBytes } });
            check('an installer whose signature is over another version (a signed older installer offered as a newer release), or whose bytes changed after it was signed, is refused with nothing left', nothing(otherVer) && nothing(altered) && altered.asked === 1, whyD([otherVer, altered]));
            const badSig = []; for (const s of ['', 'words', Buffer.alloc(1 << 20, 65), sha256(SETUP)]) badSig.push(await fetchSetup({ setup: { sigText: s } }));
            check('a signature file that could not be a signature (empty, words, a megabyte of filler, a hex digest) is refused before the installer is asked for at all: nothing downloaded, nothing left',
                badSig.every(r => !!r.err && !r.res && r.left.length === 0 && r.asked === 0) && nothing(badSig[0]) && nothing(badSig[1]) && nothing(badSig[3]), whyD(badSig));
            const noKey = await fetchSetup({ setup: {} }, { pubKey: '' }), nullKey = await fetchSetup({ setup: {} }, { pubKey: null }), dflt = await fetchSetup({ setup: {} }, { noKeyOpt: true });
            const shellKeyD = (() => { try { return String(require('../system/resources/app/updatekey.js').UPDATE_PUBKEY || '').trim(); } catch (e) { return ''; } })();   // the shell's own key: empty until the owner makes one
            check('with no public key configured no installer is fetched: an empty key and no key each refuse, the installer never asked for; left to the shell\'s own key the suite\'s release is refused all the same with nothing left — unasked while that key is empty, and once the owner has made one because the release is signed with the suite\'s key, never with that one', [noKey, nullKey].every(r => nothing(r) && r.asked === 0) && nothing(dflt) && (shellKeyD ? true : dflt.asked === 0), whyD([noKey, nullKey, dflt]).concat([!!shellKeyD]));
            const badVer = []; for (const v of ['1.5.1' + NL, '../1.5.1', '', 'a/b', null, 151]) badVer.push(await fetchSetup({ setup: {} }, { version: v }));
            check('a version that is not a plain version (a line break, a path, nothing, a number) names no file and fetches nothing', badVer.every(r => nothing(r) && r.asked === 0), whyD(badVer));

            /* ---- the caps, a redirect that never ends, an error, a download cut short ---- */
            const realCWS = fs.createWriteStream; let opened = 0; fs.createWriteStream = function() { opened++; return realCWS.apply(fs, arguments); };
            let big = null, bodySent = 0;
            try {
                big = await fetchSetup({ setup: { served: (req, res) => { res.on('error', () => {}); res.writeHead(200, { 'Content-Length': 700 * 1024 * 1024 }); const c = Buffer.alloc(65536); const t = setInterval(() => { if (res.destroyed || bodySent > 64) { clearInterval(t); return; } bodySent++; res.write(c); }, 5); t.unref(); res.on('close', () => clearInterval(t)); } } });
            } finally { fs.createWriteStream = realCWS; }
            check('an installer whose stated length is past the cap (600 MB) is refused before a byte of it is read: "download too large", no file ever opened, nothing left', nothing(big, /^download too large$/) && opened === 0, j([big && big.err, opened, bodySent]));
            const stream = (n, o) => (req, res) => { res.on('error', () => {}); res.writeHead(200, o && o.len ? { 'Content-Length': o.len } : {}); let sent = 0, open = true; res.on('close', () => { open = false; }); const c = Buffer.alloc(16384, 7); const pump = () => { while (open && sent < n) { sent++; if (!res.write(c)) { res.once('drain', pump); return; } } if (!open) return; if (o && o.cut) res.destroy(); else res.end(); }; pump(); };
            const past = await fetchSetup({ setup: { served: stream(64) } }, { maxBytes: 100000 });
            const small = await fetchSetup({ setup: {} }, { maxBytes: 1000 });
            check('bytes that run past the cap stop the download ("download too large") and the part that was written is removed — for a body sent with no stated length, and for a stated length past a smaller cap', nothing(past, /^download too large$/) && nothing(small, /^download too large$/), whyD([past, small]));
            let hops = 0;
            const loop = await fetchSetup({ setup: { served: (req, res) => { hops++; res.writeHead(302, { Location: req.url }); res.end(); } } });
            let bounced = 0;
            const bounce = await fetchSetup({ setup: { served: (req, res) => { if (/[?]go=1$/.test(req.url)) { res.writeHead(200, { 'Content-Length': SETUP.length }); return res.end(SETUP); } bounced++; res.writeHead(302, { Location: req.url + '?go=1' }); res.end(); } } });
            check('a redirect that never ends is given up after five hops with nothing left; one that leads to the file (a release asset bounces through a download host) is followed', nothing(loop, /^HTTP 302 for /) && hops === 6 && !bounce.err && bounced === 1 && !!bounce.res && bounce.res.sha256 === sha256(SETUP) && j(bounce.left) === j(['Waypoint_Setup-1.5.1.exe']), j([loop.err, hops, bounce.err, bounced]));
            const e500 = await fetchSetup({ setup: { served: (req, res) => { res.writeHead(500); res.end('no'); } } }), e404 = await fetchSetup({ setup: { served: (req, res) => { res.writeHead(404); res.end(); } } });
            const cutA = await fetchSetup({ setup: { served: stream(8, { len: 16384 * 20, cut: true }) } }), cutB = await fetchSetup({ setup: { served: stream(8, { cut: true }) } });
            check('an installer the server will not give (an error answer) or one cut short (the connection lost part-way, with or without a stated length) fails with nothing left behind',
                nothing(e500, /^HTTP 500 for /) && nothing(e404, /^HTTP 404 for /) && [cutA, cutB].every(r => !!r.err && !r.res && r.left.length === 0), whyD([e500, e404, cutA, cutB]));
        }
        {   /* ---- starting it: never a real process here — spawn is this suite's own ---- */
            const fake = (log, o) => (file, args, options) => { const ch = { pid: o && o.noPid ? undefined : 4242, unrefs: 0, unref() { this.unrefs++; }, on() {}, once(ev, fn) { if (o && o.noPid && ev === 'error') setImmediate(() => fn(Object.assign(new Error('spawn EACCES'), { code: 'EACCES' }))); } }; log.push({ file, args, options, ch }); return ch; };
            const got = await fetchSetup({ setup: {} }), inst = install('1.5.0'), log = [];
            let r1 = null, e1 = null; try { r1 = await within(runInst({ file: got.res.file, sha256: got.res.sha256, appRoot: inst.root, spawn: fake(log) }), 60000, 'run'); } catch (e) { e1 = String(e && e.message || e); }
            const c = log[0] || {};
            check('runInstaller starts the checked file once, detached, with no shell and no pipes, with exactly /SILENT /UPDATE=1 /SUPPRESSMSGBOXES /NORESTART and /DIR=<this copy\'s own folder> as one argument, and lets go of it (unref)',
                !e1 && !!r1 && r1.ok === true && log.length === 1 && c.file === got.res.file && j(c.args) === j(['/SILENT', '/UPDATE=1', '/SUPPRESSMSGBOXES', '/NORESTART', '/DIR=' + inst.root]) && j(c.options) === j({ detached: true, stdio: 'ignore', shell: false }) && c.ch.unrefs === 1, j([e1, log.map(x => [x.file, x.args, x.options])]));
            const spaced = path.join(tmp, 'My Games', 'Way point'); fs.mkdirSync(path.join(spaced, 'system'), { recursive: true });
            const log2 = []; let e2 = null; try { await runInst({ file: got.res.file, sha256: got.res.sha256, appRoot: spaced + path.sep, spawn: fake(log2) }); } catch (e) { e2 = String(e.message); }
            const up = read('system/resources/app/updater.js');
            check('a folder with spaces in its name goes in whole as the one /DIR= argument with no quotes of the updater\'s own and no trailing separator (Node quotes the argument, Setup reads the same path); the updater never starts anything through a shell, and starts nothing but the installer',
                !e2 && log2.length === 1 && log2[0].args[4] === '/DIR=' + spaced && log2[0].args.length === 5 && !/"/.test(log2[0].args[4]) && log2[0].options.shell === false
                && !/shell:\s*true/.test(up) && !/\bexec(File)?(Sync)?\(/.test(up) && !/windowsVerbatimArguments/.test(up) && (up.match(/\bspawn\(/g) || []).length === 1 && !/openPath|openExternal/.test(up), j([e2, log2.map(x => x.args)]));
            const tries = [];
            const tryRun = async (o, sp) => { const lg = []; let err = null, res = null; try { res = await within(runInst(Object.assign({ file: got.res.file, sha256: got.res.sha256, appRoot: inst.root, spawn: sp ? sp(lg) : fake(lg) }, o)), 60000, 'run'); } catch (e) { err = String(e && e.message || e); } const t = { err, res, n: lg.length }; tries.push(t); return t; };
            const bare = path.join(tmp, 'bare' + (++seq)); fs.mkdirSync(bare);
            const rel = await tryRun({ appRoot: 'relative' + path.sep + 'folder' }), dot = await tryRun({ appRoot: '.' }), gone = await tryRun({ appRoot: path.join(tmp, 'no-such-folder') }), noSys = await tryRun({ appRoot: bare }), quoted = await tryRun({ appRoot: inst.root + '" /DIR="' + bare }), none = await tryRun({ appRoot: undefined });
            check('runInstaller refuses, starting nothing, a folder that is not this copy\'s own: a relative path, a folder that is not there, one that holds no system folder, a path with a double quote in it, none at all',
                [rel, dot, gone, noSys, quoted, none].every(t => !!t.err && /cannot install an update by itself/.test(t.err) && !t.res && t.n === 0), j(tries));
            const copy = path.join(got.dir, 'changed.exe'); fs.writeFileSync(copy, Buffer.concat([SETUP, Buffer.from('x')]));
            const tampered = await tryRun({ file: copy }), noDigest = await tryRun({ sha256: undefined }), wrongDigest = await tryRun({ sha256: sha256(Buffer.from('other')) }), noFile = await tryRun({ file: path.join(got.dir, 'missing.exe') }), relFile = await tryRun({ file: 'Waypoint_Setup.exe' });
            check('the file is hashed again right before it is started and must still be the digest that was verified: a file that changed on disk meanwhile, no digest, another digest, a file that is gone and a relative path each start nothing',
                [tampered, noDigest, wrongDigest, noFile].every(t => !!t.err && /changed after it was checked/.test(t.err) && t.n === 0) && !!relFile.err && relFile.n === 0, j([tampered, noDigest, wrongDigest, noFile, relFile]));
            const failed = await tryRun({}, lg => fake(lg, { noPid: true }));
            check('an installer the system will not start (no process came of it) is an error that says so, never a silent success', !!failed.err && /could not be started \(EACCES\)/.test(failed.err) && !failed.res && failed.n === 1, failed);
        }
        {   /* ---- what a check offers ---- */
            const base0 = { tag: '1.5.1', noZip: true, setup: {}, self: true, checkKey: PUB };
            const yes = await look(base0), needShell = await look(Object.assign({}, base0, { noZip: false, manifest: { version: '1.5.1', minShell: '1.5.1' } }));
            const cases = [Object.assign({}, base0, { noZip: false }), Object.assign({}, base0, { setup: { noSig: true } }), Object.assign({}, base0, { setup: undefined }), Object.assign({}, base0, { checkKey: '' }), Object.assign({}, base0, { checkKey: undefined }),
                { tag: '1.5.1', noZip: true, setup: {}, checkKey: PUB }, Object.assign({}, base0, { self: 'true' }), Object.assign({}, base0, { self: 1 }), Object.assign({}, base0, { self: false }), Object.assign({}, base0, { tag: '1.5.0' }), Object.assign({}, base0, { tag: '1.4.9' })];
            const no = []; for (const c of cases) no.push(await look(c));
            const sized = []; for (const s of [-1, 0, 1.5, '300', null, 2 ** 60]) sized.push((await look(Object.assign({}, base0, { setup: { size: s } }))).installerSize);
            check('canSelfInstall is true only when the release needs the installer, lists the installer AND its signature, a key is configured, and the shell itself says this copy can run one (true, nothing else): false for a release this shell can take in one click, an installer with no signature, no installer, no key (an empty one, and the shell\'s own while it is empty: once the owner has made the key the shell\'s own counts as configured), a caller that does not say so or says it loosely, and a release that is not newer; a size that is no whole positive number is no size',
                yes.canSelfInstall === true && needShell.canSelfInstall === true && needShell.needsInstaller === true && no.every((i, k) => i.canSelfInstall === (k === 4 && !!(() => { try { return String(require('../system/resources/app/updatekey.js').UPDATE_PUBKEY || '').trim(); } catch (e) { return ''; } })())) && no[0].canHotUpdate === true && no[1].needsInstaller === true && no[1].installerSig === null && no[2].installer === null
                && j(sized) === j([null, null, null, null, null, null]), j([yes.canSelfInstall, no.map(i => i.canSelfInstall), sized]));
        }
        {   /* ---- the four routes, through the handler both servers mount ---- */
            const inst = install('1.5.0'), savesBefore = tree(path.join(inst.root, 'saves')), dataDir = path.join(inst.sys, 'userdata'), tmpDir = path.join(tmp, 'tmp' + (++seq)); fs.mkdirSync(tmpDir);
            const spawned = [], quits = [];
            let lastRes = null, gate = null;
            const held = (req, res) => { res.on('error', () => {}); res.writeHead(200, { 'Content-Length': SETUP.length }); res.write(SETUP.slice(0, 100000)); gate = () => { gate = null; res.end(SETUP.slice(100000)); }; };
            const heldApi = publish({ tag: '1.5.1', noZip: true, setup: { served: held } });
            const cfg = { repo: 'owner/repo', currentVersion: '1.5.0', shellVersion: '1.5.0', systemDir: inst.sys, apiUrl: heldApi, pubKey: PUB, appRoot: inst.root, dataDir, tmpDir,
                spawn: (file, args, options) => { spawned.push({ file, args, options }); return { pid: 77, unref() {}, on() {} }; }, quit: () => { quits.push({ answered: !!(lastRes && lastRes.writableFinished) }); } };
            const handle = updater.makeHandler(cfg);
            const hs = http.createServer(async (req, res) => { lastRes = res; let done = false; try { done = await handle(req, res, new URL(req.url, 'http://localhost')); } catch (e) { done = false; } if (!done) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{"unrouted":true}'); } });
            await new Promise(r => hs.listen(0, '127.0.0.1', r)); hs.unref();
            const call = (method, p, body) => within(new Promise(resolve => {
                const req = http.request({ host: '127.0.0.1', port: hs.address().port, method, path: p, agent: false, headers: body ? { 'Content-Type': 'application/json' } : {} }, res => { const bufs = []; res.on('data', b => bufs.push(b)); res.on('end', () => { let json = null; try { json = JSON.parse(Buffer.concat(bufs).toString('utf8')); } catch (e) {} resolve({ code: res.statusCode, json: json || {} }); }); });
                req.on('error', e => resolve({ code: 0, json: {}, err: String(e && e.code) }));
                req.setTimeout(60000, () => req.destroy(new Error('no answer')));
                if (body) req.write(body); req.end();
            }), 90000, method + ' ' + p);
            const until = async (fn, what) => { for (let n = 0; n < 400; n++) { const s = await call('GET', '/api/update-installer-status'); if (fn(s.json)) return s.json; await new Promise(r => { const t = setTimeout(r, 15); t.unref(); }); } throw new Error('never came: ' + what); };
            const dirs = () => fs.readdirSync(tmpDir).filter(n => /^waypoint-update-/.test(n));
            const plainStatus = s => j(Object.keys(s).sort()) === j(['error', 'got', 'state', 'total', 'version']) && typeof s.state === 'string' && typeof s.got === 'number' && (s.total === null || typeof s.total === 'number') && (s.version === null || typeof s.version === 'string') && (s.error === null || typeof s.error === 'string');

            // a copy that cannot run an installer (the shell does not say it can): nothing starts
            const s0 = await call('GET', '/api/update-installer-status'), c0 = await call('GET', '/api/update-check?force=1');
            const p0 = await call('POST', '/api/update-installer'), r0 = await call('POST', '/api/update-installer-run'), s0b = await call('GET', '/api/update-installer-status');
            check('a copy whose shell does not say it can run an installer is offered none (canSelfInstall false) and the start is refused (409, ok false): the status stays idle, the installer is never asked for, nothing is put in the temp folder, and Run has nothing to run',
                s0.code === 200 && plainStatus(s0.json) && s0.json.state === 'idle' && c0.json.canSelfInstall === false && c0.json.needsInstaller === true && c0.json.installFailed === null && p0.code === 409 && p0.json.ok === false && typeof p0.json.error === 'string'
                && r0.code === 409 && r0.json.ok === false && s0b.json.state === 'idle' && hitsOf(heldApi, SETUP_NAME) === 0 && dirs().length === 0 && spawned.length === 0 && quits.length === 0, j([s0.json, c0.json.canSelfInstall, p0, r0]));
            cfg.selfInstall = true;
            const hotApi = publish({ tag: '1.5.1', setup: {} }), unsignedApi = publish({ tag: '1.5.1', noZip: true, installer: true });
            cfg.apiUrl = hotApi; const pHot = await call('POST', '/api/update-installer'); cfg.apiUrl = unsignedApi; const pUns = await call('POST', '/api/update-installer');
            cfg.apiUrl = base + '/r0/latest'; const pDown = await call('POST', '/api/update-installer');
            check('the start is refused as well for a release this shell can take in one click, for one whose installer has no signature, and when the release list cannot be reached: nothing downloaded, the status idle',
                [pHot, pUns, pDown].every(p => p.code === 409 && p.json.ok === false && typeof p.json.error === 'string') && (await call('GET', '/api/update-installer-status')).json.state === 'idle' && dirs().length === 0, j([pHot, pUns, pDown]));

            // old leftovers in the temp folder: swept when a download starts
            const old = path.join(tmpDir, 'waypoint-update-old'), fresh = path.join(tmpDir, 'waypoint-update-fresh'), other = path.join(tmpDir, 'something-else');
            for (const d of [old, fresh, other]) { fs.mkdirSync(d); fs.writeFileSync(path.join(d, 'f'), 'x'); }
            const twoDays = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); fs.utimesSync(old, twoDays, twoDays); fs.utimesSync(other, twoDays, twoDays);

            cfg.apiUrl = heldApi;
            const p1 = await call('POST', '/api/update-installer', JSON.stringify({ url: 'http://example.invalid/evil.exe', dir: inst.root, appRoot: tmpDir, version: '9.9.9' }));
            const mid = await until(s => s.state === 'downloading' && s.got >= 100000, 'the first part'), p2 = await call('POST', '/api/update-installer'), rMid = await call('POST', '/api/update-installer-run');
            check('the start answers at once and the status tells how it stands (state, bytes so far, the stated length, the version: numbers and plain short words, nothing else); a second start while one is under way only hears how that one stands — the installer is asked for once — and Run is refused until it is ready; nothing the request carries chooses what is fetched',
                p1.code === 200 && p1.json.ok === true && p1.json.state === 'downloading' && p1.json.version === '1.5.1' && plainStatus(mid) && mid.total === SETUP.length && mid.got < SETUP.length && mid.version === '1.5.1' && mid.error === null
                && p2.code === 200 && p2.json.ok === true && p2.json.state === 'downloading' && hitsOf(heldApi, SETUP_NAME) === 1 && rMid.code === 409 && spawned.length === 0 && dirs().filter(n => n !== 'waypoint-update-fresh').length === 1, j([p1, mid, p2, rMid.code, dirs()]));
            check('a download that starts sweeps away what earlier ones left in the temp folder more than a day ago (folders named waypoint-update-*), and nothing else: a newer one and a folder of another name stay', !fs.existsSync(old) && fs.existsSync(fresh) && fs.existsSync(other), fs.readdirSync(tmpDir));
            if (gate) gate();
            const ready = await until(s => s.state === 'ready' || s.state === 'failed', 'ready'), p3 = await call('POST', '/api/update-installer');
            const jobDir = dirs().filter(n => n !== 'waypoint-update-fresh')[0] || 'none', file = path.join(tmpDir, jobDir, 'Waypoint_Setup-1.5.1.exe');
            check('once the signature checks the status is ready, the file under its final name in a private folder of its own under the temp directory; a start then only hears that it is ready',
                ready.state === 'ready' && ready.got === SETUP.length && ready.error === null && fs.existsSync(file) && fs.readFileSync(file).equals(SETUP) && j(fs.readdirSync(path.join(tmpDir, jobDir))) === j(['Waypoint_Setup-1.5.1.exe']) && p3.code === 200 && p3.json.state === 'ready' && hitsOf(heldApi, SETUP_NAME) === 1, j([ready, p3]));
            const g1 = await call('GET', '/api/update-installer-run'), g2 = await call('GET', '/api/update-installer'), g3 = await call('POST', '/api/update-installer-status'), g4 = await call('GET', '/api/update-installer-dismiss');
            const run = await call('POST', '/api/update-installer-run', JSON.stringify({ file: 'C:/evil.exe', appRoot: tmpDir, args: ['/DIR=C:/'] }));
            await new Promise(r => { const t = setTimeout(r, 50); t.unref(); });
            let mark = null; try { mark = JSON.parse(fs.readFileSync(path.join(dataDir, 'update-install.json'), 'utf8')); } catch (e) { mark = null; }
            const run2 = await call('POST', '/api/update-installer-run'), sAfter = await call('GET', '/api/update-installer-status');
            check('Run (POST only, like the start) starts the checked file over this copy\'s own folder with the fixed arguments, whatever the request carries; it answers ok, and only after that answer has gone out is the app asked to close, once; a second Run has nothing to run',
                [g1, g2, g3, g4].every(g => g.code === 404) && run.code === 200 && run.json.ok === true && spawned.length === 1 && spawned[0].file === file && j(spawned[0].args) === j(['/SILENT', '/UPDATE=1', '/SUPPRESSMSGBOXES', '/NORESTART', '/DIR=' + inst.root]) && spawned[0].options.shell === false
                && quits.length === 1 && quits[0].answered === true && run2.code === 409 && spawned.length === 1 && sAfter.json.state === 'idle', j([run, spawned, quits, run2.code, sAfter.json]));
            const c1 = await call('GET', '/api/update-check?force=1');
            check('before it starts the installer the shell leaves a mark beside its own data (the version and the time; never in the saves folder), and while the shell is still older than that version a check says the install did not finish (installFailed)',
                !!mark && mark.version === '1.5.1' && typeof mark.at === 'number' && j(Object.keys(mark).sort()) === j(['at', 'version']) && c1.json.installFailed === '1.5.1' && tree(path.join(inst.root, 'saves')) === savesBefore && !fs.existsSync(path.join(inst.root, 'saves', 'update-install.json')), j([mark, c1.json.installFailed]));
            cfg.apiUrl = base + '/r0/latest'; const c1off = await call('GET', '/api/update-check?force=1'); cfg.apiUrl = heldApi;
            const d1 = await call('POST', '/api/update-installer-dismiss'), c2 = await call('GET', '/api/update-check');
            check('the mark is said even when the release list cannot be reached, and Dismiss removes it: the next check says nothing failed', typeof c1off.json.error === 'string' && c1off.json.installFailed === '1.5.1' && d1.code === 200 && d1.json.ok === true && c2.json.installFailed === null && !fs.existsSync(path.join(dataDir, 'update-install.json')), j([c1off.json, d1, c2.json.installFailed]));
            fs.writeFileSync(path.join(dataDir, 'update-install.json'), JSON.stringify({ version: '1.5.1', at: 1 }));
            const cStill = (await call('GET', '/api/update-check')).json.installFailed; cfg.shellVersion = '1.5.1';
            const cDone = (await call('GET', '/api/update-check')).json.installFailed, goneNow = !fs.existsSync(path.join(dataDir, 'update-install.json')); cfg.shellVersion = '1.5.0';
            const junk = []; for (const t of ['not json', '{"version":"<img src=x onerror=alert(1)>"}', '{"version":151}', '{}']) { fs.writeFileSync(path.join(dataDir, 'update-install.json'), t); junk.push([(await call('GET', '/api/update-check')).json.installFailed, fs.existsSync(path.join(dataDir, 'update-install.json'))]); }
            check('once the shell is the version the mark names the install finished: nothing is said and the mark is removed; a mark that is not one (no JSON, a version that is no plain version) says nothing and is removed', cStill === '1.5.1' && cDone === null && goneNow && junk.every(x => x[0] === null && x[1] === false), j([cStill, cDone, goneNow, junk]));

            // a file changed between the check and the run: nothing started, nobody asked to close
            const api2 = publish({ tag: '1.5.1', noZip: true, setup: {} }); cfg.apiUrl = api2;
            await call('POST', '/api/update-installer'); const ready2 = await until(s => s.state === 'ready' || s.state === 'failed', 'ready again');
            const dir2 = dirs().filter(n => n !== 'waypoint-update-fresh' && n !== jobDir)[0] || 'none', file2 = path.join(tmpDir, dir2, 'Waypoint_Setup-1.5.1.exe');
            fs.appendFileSync(file2, 'changed after it was checked');
            const bad = await call('POST', '/api/update-installer-run'), sBad = await call('GET', '/api/update-installer-status');
            check('a file that changed on disk after it was checked is not run: Run answers 500 with ok false, nothing is started, the app is not asked to close, no mark is left, the status says failed in plain words and the download\'s folder is removed',
                ready2.state === 'ready' && bad.code === 500 && bad.json.ok === false && /changed after it was checked/.test(String(bad.json.error)) && spawned.length === 1 && quits.length === 1 && !fs.existsSync(path.join(dataDir, 'update-install.json'))
                && sBad.json.state === 'failed' && /changed after it was checked/.test(String(sBad.json.error)) && !fs.existsSync(path.join(tmpDir, dir2)), j([ready2, bad, sBad.json]));
            // a download that fails its check: failed, said, nothing left; then a good one may start again
            cfg.apiUrl = publish({ tag: '1.5.1', noZip: true, setup: { key: K2.privateKey } });
            const pBad = await call('POST', '/api/update-installer'), failedS = await until(s => s.state === 'failed' || s.state === 'ready', 'failed'), leftover = dirs().filter(n => n !== 'waypoint-update-fresh' && n !== jobDir);
            cfg.apiUrl = api2; const pAgain = await call('POST', '/api/update-installer'), again = await until(s => s.state === 'ready' || s.state === 'failed', 'ready a third time');
            check('an installer that fails its signature check ends as failed, in the updater\'s own words, with its folder removed from the temp directory; a new start is then taken',
                pBad.code === 200 && failedS.state === 'failed' && REFUSED.test(String(failedS.error)) && leftover.length === 0 && pAgain.code === 200 && again.state === 'ready' && spawned.length === 1, j([failedS, leftover, again]));
            // a shell with no quit and no data folder (the dev server's): Run still answers, nothing closes, no mark anywhere
            const inst2 = install('1.5.0'), tmp2 = path.join(tmp, 'tmp' + (++seq)); fs.mkdirSync(tmp2); const sp2 = [];
            const h2 = updater.makeHandler({ repo: 'o/r', currentVersion: '1.5.0', shellVersion: '1.5.0', systemDir: inst2.sys, apiUrl: api2, pubKey: PUB });
            const fakeRes = () => { const r = { code: 0, body: '', writeHead(c) { r.code = c; }, end(b, cb) { r.body = String(b || ''); if (cb) cb(); } }; return r; };
            const ask = async (method, p) => { const r = fakeRes(); const done = await h2({ method }, r, new URL(p, 'http://localhost')); let json = null; try { json = JSON.parse(r.body); } catch (e) {} return { done, code: r.code, json: json || {} }; };
            const dCheck = await ask('GET', '/api/update-check'), dStart = await ask('POST', '/api/update-installer'), dDismiss = await ask('POST', '/api/update-installer-dismiss'), dStatus = await ask('GET', '/api/update-installer-status');
            check('a server that does not say this copy can run an installer (the dev server passes neither selfInstall nor quit) answers the same routes: the check says canSelfInstall false and nothing failed, the start is refused, the status is idle, Dismiss has nothing to remove',
                dCheck.json.canSelfInstall === false && dCheck.json.needsInstaller === true && dCheck.json.installFailed === null && dStart.code === 409 && dStart.json.ok === false && dStatus.json.state === 'idle' && dDismiss.code === 200 && dDismiss.json.ok === true && sp2.length === 0 && fs.readdirSync(tmp2).length === 0, j([dCheck.json, dStart, dStatus.json]));
            try { hs.close(); } catch (e) {}
            // the installer a finished update ran from stays in the temp folder (it was running from there): the first check of a later run clears it away
            const tdir = path.join(tmp, 'tmp' + (++seq)); fs.mkdirSync(tdir);
            const aged = n => { const dd = path.join(tdir, n); fs.mkdirSync(dd); fs.writeFileSync(path.join(dd, 'Waypoint_Setup-1.5.0.exe'), 'x'); const t = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); fs.utimesSync(dd, t, t); return dd; };
            const left = aged('waypoint-update-left'), unrelated = aged('unrelated'), sameApi = publish({ tag: '1.5.0' });
            const look1 = async extra => { const r = fakeRes(); await updater.makeHandler(Object.assign({ repo: 'o/r', currentVersion: '1.5.0', shellVersion: '1.5.0', systemDir: inst2.sys, apiUrl: sameApi, tmpDir: tdir }, extra))({ method: 'GET' }, r, new URL('/api/update-check', 'http://localhost')); return r.code; };
            const codeA = await look1({}), keptA = fs.existsSync(left), codeB = await look1({ selfInstall: true });
            check('what a finished core update left in the temp folder more than a day ago is cleared away at the first check of a later run — on a copy whose shell can run an installer, never by a server that cannot (the dev server touches no temp folder), and never a folder of another name',
                codeA === 200 && keptA && codeB === 200 && !fs.existsSync(left) && fs.existsSync(unrelated), j([codeA, keptA, codeB, fs.readdirSync(tdir)]));
        }
        {
            const main = read('system/resources/app/main.js'), dev = read('tools/dev-server.js');
            const cfgA = main.indexOf('const updateCfg = {'), cfgB = main.indexOf('};', cfgA), cfgSrc = cfgA > 0 ? main.slice(cfgA, cfgB) : '';
            let installed = null; try { installed = new Function('process', 'fs', 'path', 'rootDir', main.slice(main.indexOf('function installedCopy() {'), cfgA) + NL + 'return installedCopy;'); } catch (e) { installed = null; }
            const at = (plat, files) => { const root = path.join(tmp, 'copy' + (++seq)); fs.mkdirSync(root); for (const f of files) fs.writeFileSync(path.join(root, f), 'x'); try { return installed({ platform: plat }, fs, path, root)(); } catch (e) { return 'threw'; } };
            check('only the shell says a copy can run the installer over itself, and only for a copy the installer put there, on Windows: main.js passes selfInstall from its own test (Waypoint.exe with the installer\'s uninstaller beside it — never a portable copy or a checkout run from source, which the installer would write over), its own folder as appRoot, its own data folder (system/userdata, never the saves folder) and app.quit; the dev server passes none of them',
                !!installed && at('win32', ['Waypoint.exe', 'unins000.exe']) === true && at('win32', ['Waypoint.exe', 'UNINS001.EXE']) === true && at('win32', ['Waypoint.exe']) === false && at('win32', ['unins000.exe']) === false && at('win32', ['Waypoint.exe', 'unins000.dat', 'uninstall.exe']) === false
                && at('linux', ['Waypoint.exe', 'unins000.exe']) === false && at('darwin', ['Waypoint.exe', 'unins000.exe']) === false && installed({ platform: 'win32' }, fs, path, path.join(tmp, 'nowhere'))() === false
                && /selfInstall: installedCopy\(\),/.test(cfgSrc) && /appRoot: rootDir,/.test(cfgSrc) && /dataDir: path\.join\(rootDir, 'system', 'userdata'\),/.test(cfgSrc) && /quit: \(\) => app\.quit\(\),/.test(cfgSrc) && !/savesDir/.test(cfgSrc)
                && !/selfInstall|appRoot|dataDir|quit|spawn|tmpDir/.test(dev) && !/\bspawn\b|tmpDir|child_process/.test(main), j([!!installed, cfgSrc.length]));
        }
        {   /* ---- the installer's own script: its two additions for an app-driven silent update, pinned (it is never compiled or run here) ---- */
            const iss = read('installer.iss');
            const fnA = iss.indexOf('function AppDrivenUpdate(): Boolean;'), prep = iss.indexOf('function PrepareToInstall(var NeedsRestart: Boolean): String;'), prepEnd = iss.indexOf('end;' + NL + NL + 'var', prep), body = prep > 0 ? iss.slice(prep, prepEnd) : '';
            const waitAt = body.indexOf('if AppDrivenUpdate() then'), findAt = body.indexOf("if FindWindowByWindowName('Waypoint') <> 0 then"), killAt = body.indexOf("TaskKill('Waypoint.exe');");
            const runSec = iss.slice(iss.indexOf(NL + '[Run]' + NL), iss.indexOf(NL + '[Code]' + NL));
            check('installer.iss, pinned: a silent run with /UPDATE=1 (the app started it and is closing) waits for Waypoint\'s window to go — a look every 250 ms for up to 30 s — before the check that aborts a silent update while Waypoint runs, and any other run is as before; a second [Run] entry opens Waypoint again after such an update only (the first is skipped when silent)',
                fnA > 0 && fnA < prep && /Result := WizardSilent\(\) and \(ExpandConstant\('\{param:UPDATE\|0\}'\) = '1'\);/.test(iss.slice(fnA, prep))
                && waitAt > 0 && findAt > waitAt && killAt > findAt && /while \(FindWindowByWindowName\('Waypoint'\) <> 0\) and \(Waited < 30000\) do\s+begin\s+Sleep\(250\);\s+Waited := Waited \+ 250;\s+end;/.test(body.slice(waitAt, findAt))
                && /if WizardSilent\(\) then\s+begin\s+Result := 'Waypoint is running\. Close it \(end any multiplayer session first\) and run the update again\.';\s+exit;/.test(body.slice(findAt))
                && /Filename: "\{app\}\\Waypoint\.exe"; Description: "Launch Waypoint"; Flags: nowait postinstall skipifsilent\n/.test(runSec) && /Filename: "\{app\}\\Waypoint\.exe"; Flags: nowait; Check: AppDrivenUpdate\n/.test(runSec) && (runSec.match(/^Filename:/gm) || []).length === 2
                && /\{param:UPDATE\|0\}'\) <> '1'\) then/.test(iss), j([fnA, prep, waitAt, findAt, killAt, runSec]));
        }

        /* ================= the key file, the key tool and the release build ================= */
        {
            const keyRel = 'system/resources/app/updatekey.js', keySrc = has(keyRel) ? read(keyRel) : '';
            let pk = null; try { pk = require('../system/resources/app/updatekey.js').UPDATE_PUBKEY; } catch (e) { pk = null; }
            let kind = null; if (pk) { try { kind = crypto.createPublicKey(pk).asymmetricKeyType; } catch (e) { kind = 'unreadable'; } }
            const upSrc = read('system/resources/app/updater.js'), rel = read('tools/release.js');
            check('the public key lives in the shell alone (system/resources/app/updatekey.js, which a one-click update never replaces: the release zips system/app only): it is empty or an Ed25519 public key in PEM, the file is exactly what the key tool writes for that key, the updater reads it from there, and no private key is anywhere in it',
                typeof pk === 'string' && (pk === '' || kind === 'ed25519') && !!signkey && keySrc === signkey.keyFileText(pk) && /require\('\.\/updatekey'\)/.test(upSrc) && !/PRIVATE KEY/.test(keySrc) && !has('system/app/updatekey.js')
                && /Compress-Archive -Force -Path '\$\{path\.join\(SYSTEM, 'app', '\*'\)\}'/.test(rel), j([typeof pk, kind, keySrc.length]));
        }
        const node = (script, args, env, cwd) => cp.spawnSync(process.execPath, [script].concat(args || []), { encoding: 'utf8', timeout: 60000, env: env || cleanEnv(), cwd: cwd || tmp });
        function cleanEnv(extra) { const e = Object.assign({}, process.env); delete e.WAYPOINT_SIGNING_KEY; delete e.WAYPOINT_SIGNTOOL; delete e.GITHUB_TOKEN; return Object.assign(e, extra || {}); }
        // a scratch copy of the repository's own tools and shell files: the tools take their root from where they lie
        function scratchRepo(pubPem) {
            const r = path.join(tmp, 'repo' + (++seq));
            for (const f of ['tools/release.js', 'tools/signkey.js', 'tools/shellrev.js', 'installer.iss', 'system/resources/app/updater.js', 'system/resources/app/package.json', 'system/resources/app/main.js']) {
                fs.mkdirSync(path.dirname(path.join(r, f)), { recursive: true }); if (has(f)) fs.copyFileSync(path.join(ROOT, f), path.join(r, f));
            }
            fs.writeFileSync(path.join(r, 'system/resources/app/updatekey.js'), signkey ? signkey.keyFileText(pubPem || '') : "module.exports = { UPDATE_PUBKEY: '' };" + NL);
            if (shellrev) shellrev.record(r);   // the scratch copy's own record of its core, as the repository keeps one
            fs.mkdirSync(path.join(r, 'system', 'app'), { recursive: true });
            fs.writeFileSync(path.join(r, 'system', 'app', 'version.json'), '{"version":"0.0.0"}' + NL); fs.writeFileSync(path.join(r, 'system', 'app', 'index.html'), '<!doctype html>');
            fs.writeFileSync(path.join(r, 'README.md'), 'Current release: **0.0.0**' + NL); fs.writeFileSync(path.join(r, 'WHATSNEW.txt'), 'WAYPOINT 0.0.0' + NL + '====' + NL + NL + '- x' + NL);
            fs.writeFileSync(path.join(r, 'Waypoint.exe'), 'MZ'); fs.writeFileSync(path.join(r, 'license.txt'), 'the licence' + NL);   // the rest of what the installer's stage takes from the top
            return r;
        }
        const keyOf = r => { try { delete require.cache[require.resolve(path.join(r, 'system/resources/app/updatekey.js'))]; return require(path.join(r, 'system/resources/app/updatekey.js')).UPDATE_PUBKEY; } catch (e) { return null; } };
        const pemOf = p => { try { return crypto.createPrivateKey(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } };
        const pairs = (priv, pubPem) => { try { return crypto.createPublicKey(priv).export({ type: 'spki', format: 'der' }).equals(crypto.createPublicKey(pubPem).export({ type: 'spki', format: 'der' })); } catch (e) { return false; } };
        {
            const repo = scratchRepo(''), tool = path.join(repo, 'tools', 'signkey.js'), keyFile = path.join(repo, 'system/resources/app/updatekey.js'), emptyText = fs.readFileSync(keyFile, 'utf8');
            const outDir = path.join(tmp, 'keys' + (++seq)), priv = path.join(outDir, 'deep', 'update-signing-key.pem');
            const climbs = repo + path.sep + 'tools' + path.sep + '..' + path.sep + 'saves' + path.sep + 'key.pem';
            const inside = [path.join(repo, 'key.pem'), path.join(repo, 'dist', 'k', 'key.pem'), climbs].concat(process.platform === 'win32' ? [repo.toUpperCase() + path.sep + 'UPPER.PEM'] : []).map(p => ({ p, r: node(tool, [p]) }));
            inside.push({ p: path.join(repo, 'relative.pem'), r: node(tool, ['relative.pem'], null, repo) });   // a bare name, run from inside the repository
            const usage = node(tool, []);
            check('signkey.js refuses a private key path inside the repository (its root, a folder under it that does not exist yet, a path that climbs out and back in, the same folder in another letter case where the disk ignores case, a bare name given from inside it) and a run with no path: exit 1, nothing written, updatekey.js as it was',
                inside.every(x => x.r.status === 1 && !fs.existsSync(x.p)) && usage.status === 1 && fs.readFileSync(keyFile, 'utf8') === emptyText && !fs.existsSync(path.join(repo, 'dist')) && !fs.existsSync(path.join(repo, 'saves')), j(inside.map(x => [x.r.status, x.r.stderr]).concat([[usage.status]])));
            const made = node(tool, [priv]), privKey = pemOf(priv), pub = keyOf(repo), privText = privKey ? fs.readFileSync(priv, 'utf8') : '';
            const said = String(made.stdout) + String(made.stderr);
            check('signkey.js makes the pair: an Ed25519 private key (PKCS8 PEM) at the path given, its folder made, outside the repository; its public half written into updatekey.js as the file the shell reads; it says where the key is, to back it up and never commit it, and the WAYPOINT_SIGNING_KEY variable to set — and never prints the private key',
                made.status === 0 && !!privKey && privKey.asymmetricKeyType === 'ed25519' && /^-----BEGIN PRIVATE KEY-----/.test(privText) && typeof pub === 'string' && /^-----BEGIN PUBLIC KEY-----/.test(pub) && pairs(privKey, pub)
                && !!signkey && fs.readFileSync(keyFile, 'utf8').replace(/\r\n/g, NL) === signkey.keyFileText(pub) && said.includes(priv) && /WAYPOINT_SIGNING_KEY/.test(said) && /back (it )?up/i.test(said) && /never commit/i.test(said) && /lost/i.test(said)
                && !said.includes(privText.split(NL)[1] || 'no key body') && !/PRIVATE KEY/.test(said), j([made.status, made.stderr, said.slice(0, 200)]));
            const rootKey = (process.platform === 'win32' ? 'H:' : '') + path.sep + 'waypoint-update-signing-key.pem';
            const skSrc = read('tools/signkey.js');
            check('a key file directly under the root of a drive is outside the repository, and its folder — already there — is not made again: signkey.js makes a folder only when it is missing, and writes the key only where no file is',
                !!signkey && signkey.insideRepo(rootKey, ROOT) === false && signkey.insideRepo(rootKey, repo) === false && signkey.insideRepo(path.join(repo, 'x.pem'), repo) === true && signkey.insideRepo(repo, repo) === true
                && skSrc.includes('if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });') && skSrc.includes("fs.writeFileSync(file, privPem, { flag: 'wx', mode: 0o600 });"));
            const priv2 = path.join(outDir, 'second.pem'), keptText = fs.readFileSync(keyFile, 'utf8'), second = node(tool, [priv2]);
            check('with a public key already in updatekey.js, signkey.js refuses to make another (exit 1, no file written, the key file as it was) and names --replace', second.status === 1 && !fs.existsSync(priv2) && fs.readFileSync(keyFile, 'utf8') === keptText && /--replace/.test(String(second.stderr) + String(second.stdout)), j([second.status, second.stderr]));
            const over = node(tool, ['--replace', priv]), overSame = fs.readFileSync(priv, 'utf8') === privText && fs.readFileSync(keyFile, 'utf8') === keptText;
            check('signkey.js never overwrites a file that is already there, --replace or not: the private key and updatekey.js as they were', over.status === 1 && overSame, j([over.status, over.stderr]));
            const chkOk = node(tool, ['--check', priv]);
            const foreign = path.join(outDir, 'foreign.pem'); fs.writeFileSync(foreign, K2.privateKey.export({ type: 'pkcs8', format: 'pem' }));
            const rsaPriv = path.join(outDir, 'rsa.pem'); fs.writeFileSync(rsaPriv, crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }));
            const junk = path.join(outDir, 'junk.pem'); fs.writeFileSync(junk, 'not a key');
            const chkBad = [foreign, rsaPriv, junk, path.join(outDir, 'missing.pem')].map(p => node(tool, ['--check', p]));
            check('signkey.js --check says whether a private key file is the pair of the committed public key: exit 0 for the pair; exit 1 for another Ed25519 key, an RSA key, a file that is no key and a missing file — writing nothing',
                chkOk.status === 0 && chkBad.every(r => r.status === 1) && fs.readFileSync(keyFile, 'utf8') === keptText && fs.readFileSync(priv, 'utf8') === privText, j([chkOk.status, chkOk.stderr].concat(chkBad.map(r => r.status))));
            const rep = node(tool, ['--replace', priv2]), pub2 = keyOf(repo), priv2Key = pemOf(priv2);
            check('signkey.js --replace makes a new pair over a committed key, warning that every install then needs a new installer; the old private key no longer checks against it',
                rep.status === 0 && !!priv2Key && typeof pub2 === 'string' && pub2 !== pub && pairs(priv2Key, pub2) && /installer/i.test(String(rep.stdout) + String(rep.stderr)) && node(tool, ['--check', priv]).status === 1 && node(tool, ['--check', priv2]).status === 0, j([rep.status, rep.stderr]));

            /* ---- the release notes: plain text, never read as markup on the release page ---- */
            {
                const nRepo = scratchRepo(''), weird = 'Bold as **b**, italic as *i* and _i_, strike as ~~s~~, a tag <u>u</u> <span style="x">s</span>, a [link](https://example.com/a_b), `code`, #1 | a pipe, a \\ backslash, &lt; an entity, ![pic](x.png)';
                fs.writeFileSync(path.join(nRepo, 'WHATSNEW.txt'), 'WAYPOINT 0.0.0' + NL + '====' + NL + NL + 'Text **style**' + NL + '- ' + weird + NL + '  and a wrapped ~~line~~' + NL + NL + 'WAYPOINT 0.0.0-old' + NL + '====' + NL + '- old' + NL);
                const nr = node(path.join(nRepo, 'tools', 'release.js'), ['--notes-only'], cleanEnv());
                const vOf = JSON.parse(fs.readFileSync(path.join(nRepo, 'system/resources/app/package.json'), 'utf8')).version;
                const notesFile = path.join(nRepo, 'dist', vOf, 'RELEASE_NOTES.md'), md = fs.existsSync(notesFile) ? fs.readFileSync(notesFile, 'utf8') : '';
                const lines = md.split('\n'), bul = lines.find(l => l.startsWith('- ')) || '', head = lines.find(l => l.startsWith('### ')) || '';
                const un = s => s.replace(/\\([\\`*_~\[\]<>#|&!])/g, '$1');   // Markdown's own reading of a backslash escape
                const bare = s => s.replace(/\\./g, '');   // what is left once every escaped character is taken out
                check('release.js writes the release notes as text: every character Markdown or its HTML would read as markup (* _ ~ ` [ ] < > # | & ! and the backslash) is escaped in a heading and a bullet, wrapped lines joined first, so the page shows **, ~~, <u>, a [link](…) exactly as the notes write them; --notes-only builds them without the key and writes nothing else',
                    nr.status === 0 && un(bul.slice(2)) === weird + ' and a wrapped ~~line~~' && un(head.slice(4)) === 'Text **style**' && !/[\\`*_~\[\]<>#|&!]/.test(bare(bul.slice(2))) && !/[\\`*_~\[\]<>#|&!]/.test(bare(head.slice(4)))
                    && md.startsWith('# Waypoint Alpha ' + vOf) && !/^- olds*$/m.test(md) && !fs.existsSync(path.join(nRepo, 'Waypoint_Setup.exe')) && fs.readdirSync(path.join(nRepo, 'dist', vOf)).join() === 'RELEASE_NOTES.md', j([nr.status, String(nr.stderr).slice(0, 200), bul.slice(0, 200), head]));
            }

            /* ---- the release build refuses to build without the key ---- */
            const rel = path.join(repo, 'tools', 'release.js'), readme = () => fs.readFileSync(path.join(repo, 'README.md'), 'utf8'), ver = () => fs.readFileSync(path.join(repo, 'system', 'app', 'version.json'), 'utf8');
            const readme0 = readme(), ver0 = ver();
            const untouched = () => readme() === readme0 && ver() === ver0 && !fs.existsSync(path.join(repo, 'dist')) && !fs.existsSync(path.join(repo, 'Waypoint_Setup.exe'));
            const run = env => { const r = node(rel, [], cleanEnv(env)); return { status: r.status, said: String(r.stdout) + String(r.stderr), clean: untouched() }; };
            const insideKey = path.join(repo, 'key-in-repo.pem'); fs.copyFileSync(priv2, insideKey);
            const emptyRepo = scratchRepo(''), emptyRun = (() => { const r = node(path.join(emptyRepo, 'tools', 'release.js'), [], cleanEnv({ WAYPOINT_SIGNING_KEY: priv2 })); return { status: r.status, said: String(r.stdout) + String(r.stderr), clean: !fs.existsSync(path.join(emptyRepo, 'dist')) && fs.readFileSync(path.join(emptyRepo, 'README.md'), 'utf8') === readme0 }; })();
            const refusals = [run({}), run({ WAYPOINT_SIGNING_KEY: path.join(outDir, 'missing.pem') }), emptyRun, run({ WAYPOINT_SIGNING_KEY: priv }), run({ WAYPOINT_SIGNING_KEY: foreign }), run({ WAYPOINT_SIGNING_KEY: junk }), run({ WAYPOINT_SIGNING_KEY: insideKey })];
            fs.unlinkSync(insideKey);
            check('release.js refuses to build — exit 1, a plain message naming tools/signkey.js, before any build step (no dist folder, the README and version.json as they were, no installer): WAYPOINT_SIGNING_KEY unset, naming a missing file, an empty public key in updatekey.js, a private key that is not the committed key\'s pair (the replaced one, another one), a file that is no key, and a key file kept inside the repository',
                refusals.every(r => r.status === 1 && /tools\/signkey\.js/.test(r.said) && r.clean), j(refusals.map(r => [r.status, r.clean, r.said.slice(0, 90)])));
            // the key check and the signing step themselves, run for real from the scratch copy's own module, then through the updater
            let rk = null, rkBad = null, sig = null, applied = null;
            try {
                const sk = require(path.join(repo, 'tools', 'signkey.js'));
                rk = sk.releaseKey(priv2, repo); rkBad = [sk.releaseKey(undefined, repo), sk.releaseKey('', repo), sk.releaseKey(priv, repo), sk.releaseKey(foreign, repo)];
                const z = appZip('1.5.1'); sig = sk.signZip('waypoint-app-1.5.1.zip', sha256(z), '1.5.1', rk.key);
                applied = await attempt({ tag: '1.5.1', zip: z, sigText: sig + NL, pubKey: pub2 });
            } catch (e) { applied = { err: String(e && e.message || e) }; }
            check('the release build\'s own key check and signing step: the committed key\'s private half is taken, every other answer says why; the signature it makes over a zip is one the updater takes with the committed public key — a release built this way applies',
                !!rk && rk.ok === true && !!rkBad && rkBad.every(r => r && r.ok === false && typeof r.why === 'string' && r.why.length > 0) && typeof sig === 'string' && /^[A-Za-z0-9+/]{86}==$/.test(sig) && updater.verifyUpdate(pub2, 'waypoint-app-1.5.1.zip', sha256(appZip('1.5.1')), '1.5.1', sig) === true
                && !!applied && !applied.err && applied.res && applied.res.ok === true, j([rk && rk.ok, rkBad, applied && applied.err]));
            const src = read('tools/release.js'), iKey = src.indexOf('signkey.releaseKey(process.env.WAYPOINT_SIGNING_KEY, ROOT)'), iDist = src.indexOf('fs.mkdirSync(dist'), iReadme = src.indexOf('// 0a.');
            check('release.js, pinned: the key is checked before the first thing the build writes; the .sig is written beside the .sha256, checked as a shell would check it, and published with the other assets; signing the installer is optional (WAYPOINT_SIGNTOOL) and says so when it is skipped',
                iKey > 0 && iDist > iKey && iReadme > iKey && /fs\.writeFileSync\(zipPath \+ '\.sig', sig \+ '\\n'\);/.test(src) && /updater\.verifyUpdate\(/.test(src)
                && /const ASSETS = \['Waypoint_Setup\.exe', 'Waypoint_Setup\.exe\.sig', zipName, zipName \+ '\.sha256', zipName \+ '\.sig', 'manifest\.json'\];/.test(src) && /const missing = ASSETS\.filter\(/.test(src) && /for \(const f of ASSETS\) \{/.test(src) && (src.match(/'manifest\.json'\]/g) || []).length === 1
                && /const SIGNTOOL = process\.env\.WAYPOINT_SIGNTOOL;/.test(src) && /if \(SIGNTOOL\) \{/.test(src) && /not code-signed/.test(src) && !/Get-AuthenticodeSignature/.test(src), j([iKey, iDist, iReadme]));
            // the installer's own signature, and the core's record
            const iRev = src.indexOf('shellrev.status(ROOT)'), iIscc = src.indexOf('execSync(`"${ISCC}"'), iTool = src.indexOf('if (SIGNTOOL) {'), iSetupSig = src.indexOf("signkey.signZip('Waypoint_Setup.exe', setupSha, VERSION, SIGNKEY)"), iCopy = src.indexOf("fs.copyFileSync(SETUP, path.join(dist, 'Waypoint_Setup.exe'));");
            check('release.js, pinned: the installer, taken from the stage it is compiled in, is signed with the update key after it is compiled and after the optional code-signing step (which changes its bytes) — the same three lines with the installer\'s own name the first —, the signature is checked at once as an install will check it and goes out as Waypoint_Setup.exe.sig; minShell in the manifest and in the app\'s own version.json is the version tools/shellrev.json records, never a constant, and a stale record stops the build before the first thing it writes',
                iRev > iKey && iRev < iDist && iRev < iReadme && iIscc > 0 && iTool > iIscc && iSetupSig > iTool && iCopy > iSetupSig && /if \(!updater\.verifyUpdate\(UPDATE_PUBKEY, 'Waypoint_Setup\.exe', setupSha, VERSION, setupSig\)\) \{/.test(src)
                && /fs\.writeFileSync\(path\.join\(dist, 'Waypoint_Setup\.exe\.sig'\), setupSig \+ '\\n'\);/.test(src) && /const setupSha = crypto\.createHash\('sha256'\)\.update\(fs\.readFileSync\(SETUP\)\)\.digest\('hex'\);/.test(src) && /\nconst SETUP = path\.join\(STAGE, 'Waypoint_Setup\.exe'\);\n/.test(src)
                && !/MIN_SHELL/.test(src) && /JSON\.stringify\(\{ version: VERSION, minShell: SHELL_SINCE, built: /.test(src) && /JSON\.stringify\(\{ version: VERSION, minShell: SHELL_SINCE \}\) \+ '\\n'\)/.test(src) && !/minShell: '/.test(src), j([iKey, iRev, iDist, iIscc, iTool, iSetupSig, iCopy]));
            // run for real on the scratch copy, the right key at hand: a stale record stops it; a fresh one lets it past both refusals (it then stops at the first build step, which the scratch copy lacks)
            const mainFile = path.join(repo, 'system/resources/app/main.js'), mainText = fs.readFileSync(mainFile, 'utf8');
            fs.writeFileSync(mainFile, mainText + NL + '// a change to the core' + NL);
            const stale = run({ WAYPOINT_SIGNING_KEY: priv2 });
            const recText = fs.readFileSync(path.join(repo, 'tools', 'shellrev.json'), 'utf8');
            fs.writeFileSync(mainFile, mainText);
            fs.writeFileSync(path.join(repo, 'tools', 'shellrev.json'), JSON.stringify({ hash: JSON.parse(recText).hash, since: '9.9.9' }));
            const future = run({ WAYPOINT_SIGNING_KEY: priv2 });
            fs.unlinkSync(path.join(repo, 'tools', 'shellrev.json'));
            const noRec = run({ WAYPOINT_SIGNING_KEY: priv2 });
            fs.writeFileSync(path.join(repo, 'tools', 'shellrev.json'), recText);
            check('release.js refuses to build — exit 1, a plain message naming tools/shellrev.js, nothing written — while the core\'s record is stale (a core file changed since it was recorded), missing, or names a version newer than the release being built',
                [stale, future, noRec].every(r => r.status === 1 && /tools\/shellrev\.js/.test(r.said) && !/signkey/.test(r.said) && r.clean) && /the core changed since tools\/shellrev\.json was recorded: run node tools\/shellrev\.js/.test(stale.said), j([stale, future, noRec].map(r => [r.status, r.clean, r.said.slice(0, 120)])));
            const past = node(rel, [], cleanEnv({ WAYPOINT_SIGNING_KEY: priv2 })), pastSaid = String(past.stdout) + String(past.stderr);
            let vj = null; try { vj = JSON.parse(ver()); } catch (e) { vj = null; }
            check('with the right key and a fresh record the build goes past both refusals, and the app\'s own version.json — the first thing it writes into the app, inside what is signed — names the core it needs (minShell: the record\'s since)',
                !/Not built/.test(pastSaid) && !!vj && vj.version === require('../system/resources/app/package.json').version && vj.minShell === JSON.parse(recText).since && j(Object.keys(vj)) === j(['version', 'minShell']) && !fs.existsSync(path.join(repo, 'Waypoint_Setup.exe')), j([past.status, vj, pastSaid.slice(0, 200)]));

            /* ---- the installer is compiled from a clean copy (the stage): release.js run to its end on a scratch copy, the right key at hand. Inno Setup,
               the app zip's archiver and the tour's check are stand-ins of the suite's own (the stand-in for Inno Setup writes down what it was handed and
               every file beside the script it was handed, then puts an installer there), so nothing of Inno Setup runs on any machine, and PowerShell runs on Windows alone, to read which files
               are marked hidden ---- */
            {
                const vNow = require('../system/resources/app/package.json').version, win = process.platform === 'win32', same = (a, b) => (win ? String(a).toLowerCase() === String(b).toLowerCase() : a === b);
                const put = (root, rel, data) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); };
                const link = (target, at) => { try { fs.symlinkSync(target, at, 'junction'); return true; } catch (e) { return false; } };
                const stub = path.join(tmp, 'stubs' + (++seq)), log = path.join(stub, 'iscc-log.json'), isccJs = path.join(stub, 'iscc.js'), psJs = path.join(stub, 'ps.js');
                fs.mkdirSync(stub, { recursive: true });
                fs.writeFileSync(isccJs, ["'use strict';", "const fs = require('fs'), path = require('path'), crypto = require('crypto');", "const iss = process.argv[2], dir = path.dirname(iss), files = {};",
                    "const walk = rel => { for (const n of fs.readdirSync(rel ? path.join(dir, rel) : dir)) { const r = rel ? rel + '/' + n : n, p = path.join(dir, r), st = fs.lstatSync(p); if (st.isSymbolicLink()) files[r] = 'link'; else if (st.isDirectory()) { files[r + '/'] = 'folder'; walk(r); } else files[r] = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); } };",
                    "walk('');", "fs.writeFileSync(process.env.WP_ISCC_LOG, JSON.stringify({ args: process.argv.slice(2), files: files }));", "fs.writeFileSync(path.join(dir, 'Waypoint_Setup.exe'), 'an installer the stand-in made');"].join(NL) + NL);
                fs.writeFileSync(psJs, ["'use strict';", "const m = /-DestinationPath '([^']+)'/.exec(process.argv.slice(2).join(' '));", "require('fs').writeFileSync(m[1], 'PK an archive the stand-in made');"].join(NL) + NL);
                const exe = (name, js) => { const p = path.join(stub, name + (win ? '.cmd' : '')); fs.writeFileSync(p, win ? '@"' + process.execPath + '" "' + js + '" %*\r\n' : '#!/bin/sh\nexec "' + process.execPath + '" "' + js + '" "$@"\n'); if (!win) fs.chmodSync(p, 0o755); return p; };
                const iscc = exe('iscc', isccJs); exe('powershell', psJs);
                const envOf = () => { const e = cleanEnv({ WAYPOINT_SIGNING_KEY: priv2, ISCC: iscc, WP_ISCC_LOG: log }), pk = Object.keys(e).find(k => k.toUpperCase() === 'PATH') || 'PATH'; e[pk] = stub + path.delimiter + (e[pk] || ''); return e; };
                const sr = scratchRepo(pub2);
                fs.writeFileSync(path.join(sr, 'tools', 'tutorialcheck.js'), "'use strict';" + NL);   // the tour's own suite checks the tour: here it passes
                const DECOYS = { 'NOTES.md': 'private notes', '.agent/worktrees/w/system/app/scripts/x.js': 'old code', 'IMPROVEMENTS.md': '# ideas', 'private/reader.js': 'mine', 'saves/data.json': '{}', 'docs/plan.md': '#', '.github/workflows/checks.yml': 'name: x', '.gitattributes': '* text', 'Waypoint_Setup.exe': 'an old installer', 'unknown-root-file.txt': '?', 'system/userdata/settings.json': '{"mine":1}', 'system/app.prev/index.html': 'prev', 'system/app.new/index.html': 'new', 'system/app.bad/index.html': 'bad' };
                for (const k of Object.keys(DECOYS)) put(sr, k, DECOYS[k]);
                put(sr, 'system/app/assets/fonts/Some Face/SomeFace-Regular.ttf', Buffer.from([0, 1, 0, 0, 13, 10, 0, 255]));
                const ran = node(path.join(sr, 'tools', 'release.js'), [], envOf()), said = String(ran.stdout) + String(ran.stderr);
                let got = null; try { got = JSON.parse(fs.readFileSync(log, 'utf8')); } catch (e) { got = null; }
                // what the stage should hold, read from the scratch tree by the suite's own walk: the five files at the top, and system/ but for its five folders
                const SKIP = ['system/userdata', 'system/app.prev', 'system/app.new', 'system/app.bad', 'system/app/private'], want = {};
                for (const f of ['Waypoint.exe', 'license.txt', 'README.md', 'WHATSNEW.txt', 'installer.iss']) want[f] = sha256(fs.readFileSync(path.join(sr, f)));
                const wantWalk = rel => { want[rel + '/'] = 'folder'; for (const n of fs.readdirSync(path.join(sr, rel))) { const r = rel + '/' + n; if (SKIP.indexOf(r.toLowerCase()) >= 0) continue; if (fs.statSync(path.join(sr, r)).isDirectory()) wantWalk(r); else want[r] = sha256(fs.readFileSync(path.join(sr, r))); } };
                wantWalk('system');
                const sortKeys = o => { const out = {}; for (const k of Object.keys(o || {}).sort()) out[k] = o[k]; return out; };
                const dist = path.join(sr, 'dist', vNow), setupFile = path.join(dist, 'Waypoint_Setup.exe'), setupBytes = fs.existsSync(setupFile) ? fs.readFileSync(setupFile) : Buffer.alloc(0);
                let setupSig = ''; try { setupSig = fs.readFileSync(setupFile + '.sig', 'utf8').trim(); } catch (e) { setupSig = ''; }
                const distList = fs.existsSync(dist) ? fs.readdirSync(dist).sort() : [], zipN = 'waypoint-app-' + vNow + '.zip';
                check('release.js run to its end (a scratch copy, the right key, stand-ins for Inno Setup and the archiver): Inno Setup is handed the staged installer.iss in dist/<version>/stage and nothing else, and beside it lie exactly the five files of the top and system/ but for its five folders, each byte for byte as the build left it (the README naming the release and the app\'s version.json written before the copy), while a notes file, a folder of working copies, IMPROVEMENTS.md, private/, saves/, docs/, .github/, .gitattributes, an old installer, a file nobody knows and the five folders lie beside the real script and are not copied; a private folder beside the build no longer stops it',
                    ran.status === 0 && !!got && Array.isArray(got.args) && got.args.length === 1 && same(got.args[0], path.join(fs.realpathSync(sr), 'dist', vNow, 'stage', 'installer.iss'))
                    && j(sortKeys(got.files)) === j(sortKeys(want)) && /Current release: \*\*Waypoint Alpha \d+\.\d+\.\d+\*\*/.test(fs.readFileSync(path.join(sr, 'README.md'), 'utf8')) && JSON.parse(fs.readFileSync(path.join(sr, 'system', 'app', 'version.json'), 'utf8')).version === vNow,
                    j([ran.status, said.slice(-400), got && got.args, got && Object.keys(got.files).filter(k => !(k in want)), Object.keys(want).filter(k => !got || !(k in got.files))]));
                check('the installer is taken out of the stage: the copy in dist/<version>/ is the one Inno Setup made there, its signature (Waypoint_Setup.exe.sig) checks against the key as an install will check it, the stage is removed once it is out, nothing is written at the top of the tree (an old installer there stays as it was), and dist/<version>/ holds what a release carries and its notes, nothing else',
                    ran.status === 0 && setupBytes.toString('utf8') === 'an installer the stand-in made' && updater.verifyUpdate(pub2, 'Waypoint_Setup.exe', sha256(setupBytes), vNow, setupSig) === true && !fs.existsSync(path.join(dist, 'stage'))
                    && fs.readFileSync(path.join(sr, 'Waypoint_Setup.exe'), 'utf8') === 'an old installer' && j(distList) === j(['RELEASE_NOTES.md', 'Waypoint_Setup.exe', 'Waypoint_Setup.exe.sig', zipN, zipN + '.sha256', zipN + '.sig', 'manifest.json'].sort()) && /Copying what an install needs into /.test(said), j([ran.status, distList, setupSig.length]));
                // and a file of the list that is missing, or a junction in what would be copied, refuses the build before the first thing it writes
                const before = r => ({ readme: fs.readFileSync(path.join(r, 'README.md'), 'utf8'), ver: fs.readFileSync(path.join(r, 'system', 'app', 'version.json'), 'utf8') });
                const asWas = (r, b) => { const n = before(r); return n.readme === b.readme && n.ver === b.ver && !fs.existsSync(path.join(r, 'dist')) && !fs.existsSync(path.join(r, 'Waypoint_Setup.exe')); };
                const m = scratchRepo(pub2); fs.unlinkSync(path.join(m, 'license.txt')); const mB = before(m), mRun = node(path.join(m, 'tools', 'release.js'), [], envOf()), mSaid = String(mRun.stdout) + String(mRun.stderr);
                const k = scratchRepo(pub2); put(tmp, 'outside' + seq + '/secret.txt', 'outside the tree'); const kLinked = link(path.join(tmp, 'outside' + seq), path.join(k, 'system', 'app', 'away'));
                const kB = before(k), kRun = node(path.join(k, 'tools', 'release.js'), [], envOf()), kSaid = String(kRun.stdout) + String(kRun.stderr);
                check('release.js refuses to build, exit 1, in one plain line naming it and before the first thing it writes (no dist folder, the README and version.json as they were): a file the installer needs that is missing (license.txt)' + (kLinked ? ', and a junction inside system/app to a folder outside the tree' : ' (no junction could be made on this machine)'),
                    mRun.status === 1 && mSaid.indexOf('Not built: license.txt is missing, and the installer needs it.') >= 0 && asWas(m, mB)
                    && (!kLinked || (kRun.status === 1 && kSaid.indexOf('Not built: system/app/away is a link or a junction.') >= 0 && asWas(k, kB))), j([mRun.status, mSaid.slice(0, 200), kLinked, kRun.status, kSaid.slice(0, 200)]));
                // and a folder that Windows marks hidden: the installer leaves it out, and its copy in the stage would not be hidden
                if (win) {
                    const hd = scratchRepo(pub2); put(hd, 'system/app/assets/x.png', 'p'); let hMarked = false;
                    try { cp.execFileSync(path.join(process.env.SystemRoot || 'C:\Windows', 'System32', 'attrib.exe'), ['+h', path.join(hd, 'system', 'app', 'assets')], { stdio: 'ignore', windowsHide: true }); hMarked = true; } catch (e) { hMarked = false; }
                    const hB = before(hd), hRun = node(path.join(hd, 'tools', 'release.js'), [], envOf()), hSaid = String(hRun.stdout) + String(hRun.stderr);
                    check('release.js refuses to build, exit 1, in one plain line naming it and before the first thing it writes, while a folder of what would be copied is marked hidden (system/app/assets, marked by Windows\' own attrib): the installer leaves out what is hidden, and its copy in the stage would not be hidden',
                        hMarked && hRun.status === 1 && hSaid.indexOf('Not built: system/app/assets is marked hidden. ') >= 0 && asWas(hd, hB), j([hMarked, hRun.status, hSaid.slice(0, 200)]));
                }
            }
        }
        {   /* ---- the core's revision: tools/shellrev.js ---- */
            const sr = shellrev, pkgV = require('../system/resources/app/package.json').version, st = sr ? sr.status(ROOT) : {};
            const wanted = (read('system/app/scripts/settings.js').match(/^var SHELL_WANTED = '([^']+)';/m) || [])[1];
            const listed = sr ? sr.shellFiles(ROOT) : [];
            check('the core\'s record (tools/shellrev.json) is the core\'s: its hash is the one computed now from every file under system/resources/app and from installer.iss — a core file changed without running node tools/shellrev.js fails here —, its since is a plain version not newer than package.json\'s, and settings.js\'s SHELL_WANTED names the same version',
                !!sr && st.ok === true && /^[0-9a-f]{64}$/.test(String(st.hash)) && /^\d+\.\d+\.\d+$/.test(String(st.since)) && updater.cmpVersion(st.since, pkgV) <= 0 && wanted === st.since
                && j(listed) === j(listed.filter(f => f !== 'installer.iss').sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).concat(['installer.iss'])) && listed.indexOf('system/resources/app/updatekey.js') >= 0 && listed.indexOf('system/resources/app/main.js') >= 0 && listed.every(f => f.indexOf(String.fromCharCode(92)) < 0), j([st, wanted, listed]));
            const mk = (o) => {
                o = o || {};
                const r = path.join(tmp, 'rev' + (++seq)), d = path.join(r, 'system', 'resources', 'app'), eol = s => o.crlf ? s.split(NL).join('\r\n') : s;
                fs.mkdirSync(d, { recursive: true }); fs.mkdirSync(path.join(r, 'tools'));
                fs.writeFileSync(path.join(d, 'main.js'), eol('const a = 1;' + NL + '// the second line' + NL));
                fs.writeFileSync(path.join(d, 'package.json'), eol(JSON.stringify(Object.assign({ name: 'waypoint', version: o.version || '1.5.0', main: 'main.js' }, o.pkg), null, 2) + NL));
                fs.writeFileSync(path.join(d, 'icon.ico'), Buffer.from([0, 1, 2, 13, 10, 3, 0]));   // not text: its CR LF is its own
                fs.writeFileSync(path.join(r, 'installer.iss'), eol('; the script' + NL + '#define AppVer "' + (o.version || '1.5.0') + '"' + NL + '[Setup]' + NL + 'AppName=Waypoint' + NL + (o.iss || '')));
                for (const k of Object.keys(o.extra || {})) { fs.mkdirSync(path.dirname(path.join(r, k)), { recursive: true }); fs.writeFileSync(path.join(r, k), o.extra[k]); }
                return r;
            };
            const h = o => sr ? sr.shellHash(mk(o)) : 'none', h0 = h();
            const A = 'system/resources/app/';
            check('the core\'s hash is the same on a checkout with CRLF line ends and one with LF, and whatever version package.json and the installer script name; it moves with any other change — a file\'s text, a new file at any depth, another field of package.json, another line of the installer script, one byte of a picture (whose CR LF is never read as a line end) — and never for a node_modules folder',
                /^[0-9a-f]{64}$/.test(h0) && h() === h0 && h({ crlf: true }) === h0 && h({ version: '1.5.1' }) === h0 && h({ crlf: true, version: '2.0.0' }) === h0
                && h({ extra: { [A + 'main.js']: 'const a = 2;' + NL + '// the second line' + NL } }) !== h0 && h({ extra: { [A + 'new.js']: 'x' } }) !== h0 && h({ extra: { [A + 'sub/deep.js']: 'x' } }) !== h0 && h({ pkg: { main: 'other.js' } }) !== h0 && h({ iss: 'CloseApplications=yes' + NL }) !== h0
                && h({ extra: { [A + 'icon.ico']: Buffer.from([0, 1, 2, 10, 3, 0]) } }) !== h0 && h({ extra: { [A + 'node_modules/x/index.js']: 'x' } }) === h0
                && !!sr && sr.hashedBytes(A + 'main.js', Buffer.from('a\r\nb\r\n')).equals(Buffer.from('a' + NL + 'b' + NL)) && sr.hashedBytes(A + 'package.json', Buffer.from('{"name":"w","version":"1.5.0"}')).equals(sr.hashedBytes(A + 'package.json', Buffer.from('{\r\n  "name": "w",\r\n  "version": "9.9.9"\r\n}\r\n'))), h0);
            const r = mk(); fs.copyFileSync(path.join(ROOT, 'tools', 'shellrev.js'), path.join(r, 'tools', 'shellrev.js'));
            const tool = path.join(r, 'tools', 'shellrev.js'), recFile = path.join(r, 'tools', 'shellrev.json'), rec = () => { try { return JSON.parse(fs.readFileSync(recFile, 'utf8')); } catch (e) { return null; } };
            const c0 = node(tool, ['--check']), noFile = !fs.existsSync(recFile), w1 = node(tool, []), rec1 = rec(), text1 = fs.existsSync(recFile) ? fs.readFileSync(recFile, 'utf8') : '', c1 = node(tool, ['--check']), w2 = node(tool, []), same2 = fs.existsSync(recFile) && fs.readFileSync(recFile, 'utf8') === text1;
            const pkgFile = path.join(r, 'system', 'resources', 'app', 'package.json'); fs.writeFileSync(pkgFile, fs.readFileSync(pkgFile, 'utf8').replace('"1.5.0"', '"1.5.1"'));
            const c2 = node(tool, ['--check']), w3 = node(tool, []), same3 = fs.existsSync(recFile) && fs.readFileSync(recFile, 'utf8') === text1;
            fs.appendFileSync(path.join(r, 'system', 'resources', 'app', 'main.js'), '// a change to the core' + NL);
            const c3 = node(tool, ['--check']), same4 = fs.existsSync(recFile) && fs.readFileSync(recFile, 'utf8') === text1, w4 = node(tool, []), rec4 = rec(), c4 = node(tool, ['--check']), bad = node(tool, ['--force']);
            check('node tools/shellrev.js, run for real on a scratch tree: --check exits 1 with no record and writes none; a first run records the hash with package.json\'s version as since; a second run and a version bump alone change nothing (the record still checks); a core file changed under the new version makes --check exit 1 with a plain line naming the command, writing nothing, and the next run records the new hash with the new version; an argument it does not know is refused',
                c0.status === 1 && noFile && w1.status === 0 && !!rec1 && /^[0-9a-f]{64}$/.test(rec1.hash) && rec1.since === '1.5.0' && j(Object.keys(rec1)) === j(['hash', 'since']) && c1.status === 0 && w2.status === 0 && same2 && c2.status === 0 && w3.status === 0 && same3
                && c3.status === 1 && /the core changed since tools\/shellrev\.json was recorded: run node tools\/shellrev\.js/.test(String(c3.stderr) + String(c3.stdout)) && same4 && w4.status === 0 && !!rec4 && rec4.since === '1.5.1' && rec4.hash !== rec1.hash && c4.status === 0 && bad.status === 1,
                j([c0.status, noFile, w1.status, rec1, c1.status, w2.status, same2, c2.status, same3, c3.status, same4, rec4, c4.status, bad.status]));
            // the key tool records the core again: a new key is a change to it
            const kr = scratchRepo(''), before = JSON.parse(fs.readFileSync(path.join(kr, 'tools', 'shellrev.json'), 'utf8'));
            const made2 = node(path.join(kr, 'tools', 'signkey.js'), [path.join(tmp, 'keys' + (++seq), 'k.pem')]), after = JSON.parse(fs.readFileSync(path.join(kr, 'tools', 'shellrev.json'), 'utf8'));
            check('making the update key changes the core (the public key lies in it), so signkey.js records the core again: the record checks at once after it, with the new hash, and the tool says so', made2.status === 0 && after.hash !== before.hash && !!sr && sr.status(kr).ok === true && /shellrev\.json/.test(String(made2.stdout)), j([made2.status, before, after, String(made2.stderr)]));
        }
        {
            const gi = read('.gitignore'), iss = read('installer.iss'), yml = read('.github/workflows/checks.yml');
            check('a private key cannot ride along by accident: *.pem is ignored by git and left out of the installer (which packs the folder), as are the updater\'s own working folders; CI runs this suite',
                /^\*\.pem$/m.test(gi) && /Excludes: "[^"]*,\*\.pem[,"]/.test(iss) && /system\\app\.bad,system\\app\.bad\\\*/.test(iss) && /system\\app\.prev,system\\app\.prev\\\*/.test(iss) && /run: node tools\/updatercheck\.js/.test(yml));
        }

        /* ================= the website's list of names: no tracked file, nor any file of the app folder, names the owner's own sheet website ================= */
        {
            // The website that serves Waypoint in a browser refuses to deploy a release any of whose files names a term on its list, and
            // shows a release's notes only where they pass the same scan (the owner, 2026-10-22, by prompt: "Refuse; clean the app first
            // (Recommended)"). The owner's own sheet website is on that list, and this repository holds it to the rule it keeps for every
            // other company's work: no tracked file, test, Help line or release note names it. This suite writes it only as the SHA-256 of
            // its name. That keeps the words out of this file and hides nothing: a name this short is found again from its hash in moments.
            // What is read: every file git tracks, and every file of the app folder as it stands on disk, tracked or not, but for the app
            // folder's own private folder. A release zips the app folder whole, untracked files too, and refuses to be built while a
            // private folder stands in it. With no git, the app folder, the notes and the guide are read. A hit is the word head, then a
            // gap, then tail characters that with head hash, in lower case, to pin. The gap is what git grep -ni reads between the two
            // halves (no character, or one that is no line break), or two or three characters that are neither a letter, a digit nor a
            // line break. Every file is read as UTF-8 and again byte for byte, and its path is read too. A new term joins TERMS by its
            // hash, never by its name.
            const TERMS = [{ head: 'shadow', tail: 4, pin: 'ed9d02bbb2b13ee09bf52ab20c35784f17c8b1e8c84babbb552de3aa911d0fa0' }];
            const GAP = /^[^\p{L}\p{N}\n]{2,3}$/u;
            // the lines (from 1) where a term stands in a text
            const termHits = (text, t) => {
                const low = String(text).toLowerCase(), h = t.head.toLowerCase(), out = [];
                for (let i = low.indexOf(h); i >= 0; i = low.indexOf(h, i + 1)) {
                    const at = i + h.length;
                    for (let g = 0; g <= 3; g++) {
                        const gap = low.slice(at, at + g), tail = low.slice(at + g, at + g + t.tail);
                        if (gap.length !== g || tail.length !== t.tail) break;
                        if (g === 1 ? gap === NL : g > 1 && !GAP.test(gap)) continue;
                        if (sha256(h + tail) === t.pin) { out.push(low.slice(0, i).split(NL).length); break; }
                    }
                }
                return out;
            };
            // the matcher's own test, on a name made of invented words that names nothing
            const pouch = { head: 'pebble', tail: 5, pin: sha256('pebblepouch') }, n = s => termHits(s, pouch).length;
            check('the website\'s list, its matcher: tried on a name of the suite\'s own made of invented words, a hit in any case, run on into a longer word, with no gap, one character that is no line break, or two or three that are neither a letter, a digit nor a line break (an en dash too); none across a line break, after a letter, past three, with a digit in a longer gap or for part of the name; each hit\'s line counted; every pin a SHA-256',
                n('a Pebble-Pouch b') === 1 && n('PEBBLEPOUCH') === 1 && n('pebblepouches') === 1 && n('pebble pouch') === 1 && n('pebble1pouch') === 1 && n('Pebble - Pouch') === 1 && n('pebble . pouch') === 1 && n('Pebble–Pouch') === 1
                && n('pebble\npouch') === 0 && n('pebbles pouch') === 0 && n('pebble    pouch') === 0 && n('pebble 1 pouch') === 0 && n('pebblepouc') === 0 && n('pebble') === 0 && n('') === 0
                && n('pebblepouch pebble pouch\nPebblePouch') === 3 && j(termHits('x\ny\npebblepouch', pouch)) === '[3]' && TERMS.every(t => /^[0-9a-f]{64}$/.test(t.pin) && t.head.length > 2 && t.tail > 0));
            // the app folder as it stands on disk, as a release zips it: every file in it, tracked or not, but for its own private folder
            const appFiles = [], walk = rel => {
                let names = []; try { names = fs.readdirSync(path.join(ROOT, rel)); } catch (e) { return; }
                for (const nm of names) { const r = rel + '/' + nm; let st = null; try { st = fs.lstatSync(path.join(ROOT, r)); } catch (e) { continue; } if (st.isDirectory()) { if (r.toLowerCase() !== 'system/app/private') walk(r); } else appFiles.push(r); }   // a link is read as a file, never walked into
            };
            walk('system/app');
            let tracked = null, how = 'every file git tracks, and every file of the app folder on disk';
            try { tracked = cp.execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 }).split('\0').filter(Boolean); } catch (e) { tracked = null; }
            if (!tracked || !tracked.length) {   // no git here (an archive of the source): the app folder, and the notes and the guide beside it
                how = 'no git here, so the app folder, the notes and the guide'; tracked = ['WHATSNEW.txt', 'README.md', 'CAMPAIGN_INTEGRATION.md'];
            }
            const trackedSet = new Set(tracked), untracked = appFiles.filter(f => !trackedSet.has(f)), files = tracked.concat(untracked);
            const found = []; let readN = 0;
            for (const f of files) {
                let b = null; try { b = fs.readFileSync(path.join(ROOT, f)); } catch (e) { continue; }
                readN++;
                for (const t of TERMS) {
                    if (termHits(f, t).length) found.push(f + ' (its path)');
                    const lines = termHits(b.toString('utf8'), t), bytes = lines.length ? [] : termHits(b.toString('latin1'), t);
                    for (const ln of lines) found.push(f + ':' + ln);
                    if (bytes.length) found.push(f + ' (read byte for byte)');
                }
            }
            check('no tracked file, and no file of the app folder a release zips, names the owner\'s own sheet website, which the website that serves Waypoint refuses a release for (the owner, 2026-10-22: "Refuse; clean the app first (Recommended)"): ' + how + ', its path and its text, the name written here only as its SHA-256',
                files.length > 100 && readN > 100 && appFiles.length > 100 && found.length === 0, { files: files.length, read: readN, app: appFiles.length, untracked: untracked.slice(0, 20), found: found.slice(0, 40) });
        }

        /* ================= Settings: Update Now and Restore the previous version, run on a page of plain objects ================= */
        {
            let src = null; try { src = slice('system/app/scripts/settings.js', 'updates'); } catch (e) { src = null; }
            const nImports = src ? src.split("import('./dialogs.js')").length - 1 : 0;
            /* The page: every element a plain object made when asked for, the shell's routes answered from a script (o.answer for
               all of them, or o.routes: per path a value, or a function of how often that path was asked; an Error is a request that
               fails, NOJSON an answer that is no JSON), timers run at once (or, with o.timers 'async', on the next turn of the loop
               with their delays noted, those past five seconds held for the test to fire). */
            const NOJSON = { nojson: true };
            function rig(o) {
                o = o || {};
                const els = {}, log = { toasts: [], fetches: [], confirms: [], reloads: 0, posted: [], nudged: 0, timers: [], late: [], saves: [], said: [], order: [] };
                const ui = id => (o.missing && o.missing.indexOf(id) >= 0) ? null : (els[id] || (els[id] = { id, style: {}, textContent: '', title: '', disabled: false, dataset: {}, handlers: {}, addEventListener(t, fn) { this.handlers[t] = fn; }, click() { if (this.handlers.click) this.handlers.click(); } }));
                const st = { cb: null };
                const dialogs = () => ({ then(fn) { fn({ showConfirm(msg, cb) { log.confirms.push(msg); st.cb = cb; } }); } });
                const fetch = (url, opt) => {
                    const method = opt && opt.method || 'GET', key = url.split('?')[0];
                    log.fetches.push([url, method]); log.order.push(method + ' ' + key); log.said.push([key, els.setUpdateState ? els.setUpdateState.textContent : '', els.updateBtn ? els.updateBtn.textContent : '']);
                    if (!o.routes) return Promise.resolve({ ok: true, json: () => Promise.resolve(typeof o.answer === 'function' ? o.answer(url) : o.answer) });
                    const a = o.routes[key], n = log.fetches.filter(f => f[0].split('?')[0] === key).length, v = typeof a === 'function' ? a(n) : a;
                    if (v === undefined || v instanceof Error) return Promise.reject(v || new Error('no such route'));
                    return Promise.resolve({ ok: true, json: () => v === NOJSON ? Promise.reject(new Error('not JSON')) : Promise.resolve(v) });
                };
                const win = { wpNet: o.net ? { active: true } : null, wpAppVersion: o.appVersion };
                if (!o.noSave) win.wpSave = imm => { log.saves.push(imm); log.order.push('save'); if (o.onSave) o.onSave(ui('saveNote'), log.saves.length); };
                const upd = { info: null, shellOld: false, shell: null, selfBusy: false, selfFailed: false, selfText: '', failNote: '', failSeen: '' };
                function BC() { this.postMessage = m => log.posted.push(m); }
                const timer = o.timers === 'async' ? (fn, ms) => { log.timers.push(ms); if (ms > 5000) log.late.push(fn); else setImmediate(fn); } : fn => { fn(); };
                const api = new Function('ui', '_upd', 'window', 'toast', 'fetch', 'dialogs', 'BroadcastChannel', 'setTimeout', 'location', 'coreNudge', 'coreInfo', 'document', 'RELEASES_PAGE',
                    '"use strict";' + NL + src.split("import('./dialogs.js')").join('dialogs()') + NL + 'return { updateUI: updateUI, checkUpdates: checkUpdates, runHotUpdate: runHotUpdate, runRestore: runRestore, cleanVer: cleanVer, runSelfUpdate: typeof runSelfUpdate === "function" ? runSelfUpdate : null, selfCan: typeof selfCan === "function" ? selfCan : null, plainLine: typeof plainLine === "function" ? plainLine : null, mbOf: typeof mbOf === "function" ? mbOf : null, showUpdateButton: showUpdateButton, showUpdateBanner: showUpdateBanner };')(
                    ui, upd, win, m => { log.toasts.push(m); if (o.onToast) o.onToast(m); }, fetch, dialogs, BC, timer, { reload() { log.reloads++; } }, () => { log.nudged++; }, () => ({ latest: '', installer: 'https://example.invalid/core', core: true }), { querySelector() { return null; } }, 'https://example.invalid/releases/latest');
                return { els, log, st, upd, api, ui, win };
            }
            const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setImmediate(r)); };
            let ok1 = false, ok2 = false, ok3 = false, ok4 = false, ok5 = false, d = [];
            if (src) {
                try {
                    // which button shows
                    const shows = info => { const r = rig({ appVersion: '1.5.1' }); r.ui('setUpdateRestoreBtn'); r.ui('setUpdateState'); r.ui('setUpdateRow'); r.upd.info = info; r.api.updateUI(); return [r.els.setUpdateRestoreBtn.style.display, r.els.setUpdateRestoreBtn.textContent]; };
                    const s = [shows({ current: '1.5.1', newer: false, hasPrev: true, prevVersion: '1.5.0' }), shows({ current: '1.5.1', newer: false, hasPrev: false, prevVersion: '1.4.9' }), shows({ current: '1.5.1', newer: false }), shows({ current: '1.5.1', newer: false, hasPrev: 'true', prevVersion: '1.5.0' }), shows(null),
                        shows({ error: 'getaddrinfo ENOTFOUND', hasPrev: true, prevVersion: '1.5.0' }), shows({ current: '1.5.1', latest: '1.5.2', newer: true, canHotUpdate: true, hasPrev: true, prevVersion: '<img src=x onerror=alert(1)>' }), shows({ current: '1.5.1', newer: false, hasPrev: true, prevVersion: 150 })];
                    ok1 = j(s[0]) === j(['block', 'Restore the previous version (1.5.0)']) && s[1][0] === 'none' && s[2][0] === 'none' && s[3][0] === 'none' && s[4][0] === 'none' && j(s[5]) === j(['block', 'Restore the previous version (1.5.0)'])
                        && j(s[6]) === j(['block', 'Restore the previous version']) && j(s[7]) === j(['block', 'Restore the previous version']);
                    d.push(s);
                    // Restore: asked first, in the app's own words naming both versions; No changes nothing; Yes posts, says so, reloads
                    const r = rig({ appVersion: '1.5.1', answer: { ok: true, version: '1.5.0' } }); r.ui('setUpdateRestoreBtn'); r.upd.info = { current: '1.5.1', hasPrev: true, prevVersion: '1.5.0' };
                    const wired = typeof r.els.setUpdateRestoreBtn.handlers.click === 'function'; if (wired) r.els.setUpdateRestoreBtn.handlers.click(); await flush();
                    const asked = r.log.confirms.slice(), before = r.log.fetches.length; r.st.cb(false); await flush(); const afterNo = r.log.fetches.length, noReload = r.log.reloads;
                    r.els.setUpdateRestoreBtn.handlers.click(); await flush(); r.st.cb(true); await flush();
                    ok2 = wired && asked.length === 1 && asked[0] === 'Go back from Waypoint Alpha 1.5.1 to Waypoint Alpha 1.5.0? Your campaigns are not touched. You can update again afterwards.' && before === 0 && afterNo === 0 && noReload === 0
                        && j(r.log.fetches) === j([['/api/update-rollback', 'POST']]) && r.log.reloads === 1 && r.log.toasts.some(t => /Restored Waypoint Alpha 1\.5\.0/.test(t)) && j(r.log.posted) === j([{ type: 'reload' }]);
                    d.push([wired, asked, before, afterNo, r.log.fetches, r.log.reloads, r.log.toasts]);
                    // refused by the shell: said, the button back, no reload; at a table: not even asked; nothing to restore: nothing
                    const f = rig({ appVersion: '1.5.1', answer: { ok: false, error: 'no previous version to restore' } }); f.ui('setUpdateRestoreBtn'); f.upd.info = { current: '1.5.1', hasPrev: true, prevVersion: '1.5.0' }; f.api.runRestore(); await flush(); f.st.cb(true); await flush();
                    const n = rig({ appVersion: '1.5.1', net: true, answer: { ok: true } }); n.ui('setUpdateRestoreBtn'); n.upd.info = { current: '1.5.1', hasPrev: true, prevVersion: '1.5.0' }; n.api.runRestore(); await flush();
                    const z = rig({ appVersion: '1.5.1', answer: { ok: true } }); z.ui('setUpdateRestoreBtn'); z.upd.info = { current: '1.5.1', hasPrev: false, prevVersion: '1.5.0' }; z.api.runRestore(); await flush();
                    const h = rig({ appVersion: '1.5.1-dev', answer: { ok: true, version: '<b>x</b>' } }); h.ui('setUpdateRestoreBtn'); h.upd.info = { current: '1.5.1', hasPrev: true, prevVersion: '<b>1.5.0</b>' }; h.api.runRestore(); await flush(); const hAsked = h.log.confirms[0]; h.st.cb(true); await flush();
                    ok3 = f.log.reloads === 0 && f.els.setUpdateRestoreBtn.disabled === false && f.log.toasts.some(t => /Could not restore/.test(t) && /no previous version to restore/.test(t))
                        && n.log.confirms.length === 0 && n.log.fetches.length === 0 && n.log.toasts.length === 1 && z.log.confirms.length === 0 && z.log.fetches.length === 0
                        && hAsked === 'Go back from Waypoint Alpha 1.5.1 to the previous version of Waypoint? Your campaigns are not touched. You can update again afterwards.' && h.log.toasts.every(t => !/[<>]/.test(t)) && h.log.reloads === 1
                        && j(['1.5.0', '1.5.1-dev', '', null, 7, '<b>', '1.5.0\n', 'x'.repeat(41)].map(v => f.api.cleanVer(v))) === j(['1.5.0', '1.5.1-dev', '', '', '', '', '', '']);
                    d.push([f.log, n.log, z.log.confirms, hAsked, h.log.toasts]);
                    // Update Now: No means no
                    const u = rig({ appVersion: '1.5.0', answer: { ok: true, version: '1.5.1' } }); u.ui('setUpdateNowBtn'); u.upd.info = { current: '1.5.0', latest: '1.5.1', newer: true, canHotUpdate: true };
                    const uWired = typeof u.els.setUpdateNowBtn.handlers.click === 'function'; u.api.runHotUpdate(); await flush(); const uAsked = u.log.confirms.length; u.st.cb(false); await flush(); const uNo = u.log.fetches.length, uNoToasts = u.log.toasts.length;
                    u.api.runHotUpdate(); await flush(); u.st.cb(true); await flush();
                    ok4 = uWired && uAsked === 1 && uNo === 0 && uNoToasts === 0 && j(u.log.fetches) === j([['/api/update-apply', 'POST']]) && u.log.reloads === 1
                        && u.log.confirms[0] === 'Update Waypoint from Alpha 1.5.0 to Alpha 1.5.1? The new version downloads, replaces the app files, and Waypoint reloads. Your campaigns and settings are untouched.' && !/\d\s*(MB|KB|GB)|couple/i.test(u.log.confirms[0]);
                    d.push([uWired, uAsked, uNo, u.log.fetches, u.log.reloads, u.log.confirms[0]]);
                    // a check: the shell's answer drawn, the Restore button with it
                    const c = rig({ appVersion: '1.5.1', answer: { current: '1.5.1', latest: '1.5.1', newer: false, hasPrev: true, prevVersion: '1.5.0' } }); c.ui('setUpdateRestoreBtn'); c.ui('setUpdateState'); c.ui('setUpdateRow');
                    await c.api.checkUpdates(true, true);
                    ok5 = c.els.setUpdateRestoreBtn.style.display === 'block' && c.els.setUpdateState.textContent === 'up to date (1.5.1)' && j(c.log.fetches) === j([['/api/update-check?force=1', 'GET']]);
                    d.push([c.els.setUpdateRestoreBtn, c.els.setUpdateState.textContent]);
                } catch (e) { d.push('threw: ' + (e && e.stack || e)); }
            }
            check('Settings: "Restore the previous version" shows only when the shell says hasPrev is true (never for a missing, false or non-boolean answer; also when the release list could not be reached), naming the version only when it is a plain version — as text', !!src && nImports === 3 && ok1, d[0]);
            check('Settings: Restore asks first in the app\'s own words, naming both versions; No changes nothing and asks the shell nothing; Yes posts /api/update-rollback, says what was restored, tells a stream window and reloads', ok2, d[1]);
            check('Settings: a restore the shell refuses is said and the button comes back, with no reload; at a multiplayer table it is not even asked; with nothing to restore the button does nothing; a version that is no plain version never reaches the question or a toast', ok3, d[2]);
            check('Settings: the Update Now question names both versions and what will happen, with no size that could go stale (the app download grew when the libraries were bundled), and takes No for an answer — nothing downloads, nothing is said; Yes posts /api/update-apply and reloads', ok4, d[3]);
            check('Settings: a check draws the shell\'s answer, the Restore button with it', ok5, d[4]);

            /* ---- an update that changes the core, in one click (Part D4) ---- */
            const SELF = { current: '1.5.0', latest: '1.5.1', newer: true, canHotUpdate: false, needsInstaller: true, canSelfInstall: true, installerSize: 115343360, installer: 'https://example.invalid/Waypoint_Setup.exe', page: 'https://example.invalid/releases/1.5.1' };
            const HOT = { current: '1.5.0', latest: '1.5.1', newer: true, canHotUpdate: true, needsInstaller: false, canSelfInstall: false };
            const ASK = "Update Waypoint from Alpha 1.5.0 to Alpha 1.5.1? This one updates Waypoint's core too: the new version downloads (about 110 MB), Waypoint closes, updates itself and opens again. Your campaigns and settings are untouched.";
            const ALL = ['setUpdateState', 'setUpdateRow', 'setUpdateNowBtn', 'setUpdateInstallerBtn', 'setUpdateRestoreBtn', 'setUpdateCheckBtn', 'updateBtn', 'updateBanner', 'updateBannerText', 'updateBannerGo', 'updateBannerNotes', 'updateBannerLater', 'installerModal', 'installerVersion', 'installerIntroNormal', 'installerIntroCore', 'installerTitle', 'saveNote'];
            const pageOf = (info, o) => { const r = rig(Object.assign({ appVersion: '1.5.0', timers: 'async' }, o)); ALL.forEach(r.ui); r.upd.info = info; return r; };
            const settle = async r => { for (let n = 0; n < 400; n++) { await flush(); if (r.done && r.done()) return true; } return false; };
            const saved = (note, n) => { note.textContent = 'Saving...'; setImmediate(() => setImmediate(() => { note.textContent = 'Saved to disk'; })); };
            let okA = false, okB = false, okC = false, okD = false, okE = false, okF = false, e = [];
            if (src) {
                try {
                    // the three controls, in each state
                    const draw = info => { const r = pageOf(info); r.api.updateUI(); r.api.showUpdateButton(info); r.api.showUpdateBanner(info); const x = r.els; return [x.setUpdateInstallerBtn.textContent, x.setUpdateInstallerBtn.style.display, x.setUpdateNowBtn.style.display, x.updateBannerGo.textContent, x.updateBannerText.textContent, x.updateBtn.textContent, x.updateBtn.title, x.setUpdateInstallerBtn.title]; };
                    const a = draw(SELF), b = draw(Object.assign({}, SELF, { canSelfInstall: false })), c = draw(Object.assign({}, SELF, { canSelfInstall: 'true' })), h = draw(HOT), u = draw(Object.assign({}, SELF, { canSelfInstall: undefined }));
                    okA = j(a.slice(0, 6)) === j(['Update', 'block', 'none', 'Update', 'Waypoint Alpha 1.5.1 is available — one click to update.', '⬆️ Update to 1.5.1']) && /updates Waypoint's core too/.test(a[6]) && !/installer/i.test(a[6]) && /one click/.test(a[7])
                        && j(b.slice(0, 6)) === j(['Get Installer', 'block', 'none', 'Get Installer', 'Waypoint Alpha 1.5.1 is available — this one comes as an installer; Update shows the steps first.', '⬆️ Update to 1.5.1']) && /comes as an installer/.test(b[6]) && /download the installer/.test(b[7])
                        && j(c) === j(b) && j(u) === j(b) && j(h.slice(0, 5)) === j(['Get Installer', 'none', 'block', 'Update', 'Waypoint Alpha 1.5.1 is available — one click to update.']) && /update in place/.test(h[6]);
                    e.push([a, b, h]);
                    // the question: in the app's own words, from cleaned values only; No means no; at a table not even asked
                    const q = pageOf(SELF, { routes: {} }); q.els.setUpdateInstallerBtn.click(); await flush();
                    const asked = q.log.confirms.slice(); q.st.cb(false); await flush(); const afterNo = q.log.fetches.length;
                    const viaBar = pageOf(SELF, { routes: {} }); viaBar.els.updateBannerGo.click(); await flush(); const viaHdr = pageOf(SELF, { routes: {} }); viaHdr.els.updateBtn.click(); await flush();
                    const ask = (info, o) => { const r = pageOf(info, Object.assign({ routes: {} }, o)); r.api.runSelfUpdate(); return r; };
                    const noFrom = ask(Object.assign({}, SELF, { current: '<b>1.5.0</b>' }), { appVersion: undefined }), fromApp = ask(Object.assign({}, SELF, { current: '<b>1.5.0</b>' }), { appVersion: '1.5.0-dev' });
                    const sizes = [undefined, null, '115343360', NaN, -5, 0, Infinity, '<img src=x>'].map(s => ask(Object.assign({}, SELF, { installerSize: s })));
                    const tiny = ask(Object.assign({}, SELF, { installerSize: 3 })), badTo = ask(Object.assign({}, SELF, { latest: '<img src=x onerror=alert(1)>' })), table = ask(SELF, { net: true }), hot = ask(HOT), cant = ask(Object.assign({}, SELF, { canSelfInstall: false }));
                    await flush();
                    okB = asked.length === 1 && asked[0] === ASK && afterNo === 0 && q.log.toasts.length === 0 && q.upd.selfBusy === false && viaBar.log.confirms[0] === ASK && viaHdr.log.confirms[0] === ASK
                        && noFrom.log.confirms[0] === ASK.replace(' from Alpha 1.5.0', '') && fromApp.log.confirms[0] === ASK && sizes.every(r => r.log.confirms[0] === ASK.replace(' (about 110 MB)', '')) && tiny.log.confirms[0] === ASK.replace('110 MB', '1 MB')
                        && badTo.log.confirms.length === 0 && badTo.log.fetches.length === 0 && badTo.log.toasts.every(t => !/[<>]/.test(t)) && badTo.els.installerModal.style.display === 'flex'
                        && table.log.confirms.length === 0 && table.log.fetches.length === 0 && j(table.log.toasts) === j(['Leave or end the multiplayer session first.']) && hot.log.confirms.length === 0 && cant.log.confirms.length === 0 && cant.log.toasts.length === 0;
                    e.push([asked, afterNo, noFrom.log.confirms, sizes.map(r => r.log.confirms[0] === ASK.replace(' (about 110 MB)', '')), tiny.log.confirms, badTo.log, table.log.toasts]);
                    // the whole way: start, a look about once a second, the progress as text, the campaign saved, then Run
                    const steps = [{ state: 'downloading', got: 0, total: 200 }, { state: 'downloading', got: 100, total: 200 }, { state: 'downloading', got: 5 * 1048576, total: null }, { state: 'verifying', got: 200, total: 200 }, { state: 'ready', got: 200, total: 200 }];
                    const f = pageOf(SELF, { onSave: saved, routes: { '/api/update-installer': { ok: true, state: 'downloading' }, '/api/update-installer-status': n => steps[n - 1] || { state: 'idle' }, '/api/update-installer-run': { ok: true }, '/api/update-check': Object.assign({}, SELF, { installFailed: '1.5.1' }), '/api/update-installer-dismiss': { ok: true } } });
                    f.done = () => f.log.late.length === 1;
                    f.els.setUpdateInstallerBtn.click(); await flush(); f.st.cb(true); const off = [f.els.setUpdateInstallerBtn.disabled, f.els.updateBtn.disabled, f.els.updateBannerGo.disabled, f.els.setUpdateRestoreBtn.disabled], came = await settle(f);
                    const polls = f.log.said.filter(x => x[0] === '/api/update-installer-status').map(x => x[1]), atRun = f.log.said.filter(x => x[0] === '/api/update-installer-run').map(x => [x[1], x[2]]);
                    okC = came && j(f.log.order) === j(['POST /api/update-installer', 'GET /api/update-installer-status', 'GET /api/update-installer-status', 'GET /api/update-installer-status', 'GET /api/update-installer-status', 'GET /api/update-installer-status', 'save', 'POST /api/update-installer-run'])
                        && j(polls) === j(['Downloading Waypoint Alpha 1.5.1…', 'Downloading Waypoint Alpha 1.5.1… 0%', 'Downloading Waypoint Alpha 1.5.1… 50%', 'Downloading Waypoint Alpha 1.5.1… 5 MB', 'Checking the download…']) && j(atRun) === j([['Waypoint is closing to update…', 'Waypoint is closing to update…']])
                        && j(f.log.saves) === j([true]) && f.log.timers.filter(t => t === 1000).length === 5 && f.log.timers.every(t => t === 1000 || t === 150 || t === 60000) && j(off) === j([true, true, true, true]) && f.log.toasts.some(t => t === 'Waypoint is closing to update…') && f.log.reloads === 0
                        && f.els.updateBanner.style.display === 'none' && f.els.installerModal.style.display !== 'flex' && f.upd.selfFailed === false;
                    e.push([came, f.log.order, polls, atRun, f.log.timers, f.log.toasts]);
                    // still here a minute later: Waypoint did not close — the next check says what came of it
                    f.log.late[0](); await flush();
                    const bar = [f.els.updateBanner.style.display, f.els.updateBannerText.textContent, f.els.updateBannerGo.textContent, f.els.updateBannerNotes.textContent, f.els.updateBannerLater.textContent, f.els.setUpdateInstallerBtn.disabled, f.upd.selfBusy];
                    f.els.updateBannerLater.click(); await flush();
                    okD = j(bar) === j(['flex', 'The update to 1.5.1 did not finish. Try Update again, or use Get Installer.', 'Update', 'Get Installer', 'Dismiss', false, false]) && f.els.updateBanner.style.display === 'none' && f.els.updateBannerNotes.textContent === 'Notes' && f.els.updateBannerLater.textContent === 'Later'
                        && j(f.log.order.slice(-2)) === j(['GET /api/update-check', 'POST /api/update-installer-dismiss']) && f.upd.failNote === '';
                    // on a later launch: the notice once, both ways on, and a way to put it away
                    const note = o => { const r = pageOf(null, Object.assign({ routes: { '/api/update-check': Object.assign({}, SELF, { installFailed: '1.5.1' }, o), '/api/update-installer-dismiss': { ok: true } } })); return r; };
                    const n1 = note(); await n1.api.checkUpdates(false, true); const n1bar = [n1.els.updateBanner.style.display, n1.els.updateBannerText.textContent]; n1.els.updateBannerGo.click(); await flush();
                    const n2 = note(); await n2.api.checkUpdates(false, true); n2.els.updateBannerNotes.click(); await flush();
                    const n3 = note({ canSelfInstall: false }); await n3.api.checkUpdates(false, true); n3.els.updateBannerGo.click(); await flush();
                    const n4 = note({ installFailed: '<b>1.5.1</b>' }); await n4.api.checkUpdates(false, true);
                    const n5 = note(); await n5.api.checkUpdates(false, true); n5.els.updateBannerLater.click(); await flush(); await n5.api.checkUpdates(true, true); await flush();
                    const n6 = note({ installFailed: null }); await n6.api.checkUpdates(false, true);
                    okD = okD && j(n1bar) === j(['flex', 'The update to 1.5.1 did not finish. Try Update again, or use Get Installer.']) && n1.log.confirms[0] === ASK && n1.log.order.indexOf('POST /api/update-installer-dismiss') > 0 && n1.els.updateBanner.style.display === 'none'
                        && n2.els.installerModal.style.display === 'flex' && n2.els.installerModal.dataset.url === SELF.installer && n2.els.installerVersion.textContent === 'Waypoint Alpha 1.5.1' && n2.log.confirms.length === 0 && n2.log.order.indexOf('POST /api/update-installer-dismiss') > 0
                        && n3.els.installerModal.style.display === 'flex' && n3.log.confirms.length === 0
                        && n4.els.updateBannerText.textContent === 'Waypoint Alpha 1.5.1 is available — one click to update.' && n4.els.updateBannerLater.textContent !== 'Dismiss' && n4.log.order.indexOf('POST /api/update-installer-dismiss') < 0
                        && n5.log.order.filter(x => x === 'POST /api/update-installer-dismiss').length === 1 && n5.els.updateBanner.style.display === 'none' && n5.upd.failNote === '' && n5.log.toasts.length === 0
                        && n6.els.updateBannerLater.textContent !== 'Dismiss' && n6.upd.failNote === '';
                    e.push([bar, f.log.order.slice(-2), n1bar, n1.log.confirms, n2.els.installerModal, n4.els.updateBannerText.textContent, n5.log.order]);
                    // nothing unsaved is lost: a save already under way ends first, then the campaign is saved now, and only its good end lets Run go
                    const go = async (o, pre) => { const r = pageOf(SELF, Object.assign({ routes: { '/api/update-installer': { ok: true }, '/api/update-installer-status': { state: 'ready' }, '/api/update-installer-run': { ok: true } } }, o)); if (pre) pre(r); r.done = () => r.log.late.length === 1 || r.upd.selfFailed === true; r.api.runSelfUpdate(); await flush(); r.st.cb(true); await settle(r); return r; };
                    let noteAtSave = null;   // what the save note said at the moment the page asked for its own save
                    const inFlight = await go({ onSave: (note, n) => { noteAtSave = note.textContent; saved(note, n); } }, r => { let reads = 0, val = 'Saving...'; Object.defineProperty(r.els.saveNote, 'textContent', { configurable: true, get() { if (++reads === 4) val = 'Saved to disk'; return val; }, set(v) { val = v; reads = 100; } }); });
                    const errSave = await go({ onSave: (note) => { note.textContent = 'Saving...'; setImmediate(() => { note.textContent = 'Error saving.'; }); } }), netSave = await go({ onSave: (note) => { note.textContent = 'Network error saving.'; } });
                    const stuck = await go({ onSave: (note) => { note.textContent = 'Saving...'; } }), noSaver = await go({ noSave: true }), foreign = await go({ onSave: (note) => { note.textContent = 'Synced to host'; } });
                    const runs = r => r.log.order.filter(x => x === 'POST /api/update-installer-run').length;
                    const io = read('system/app/scripts/io.js');
                    okE = runs(inFlight) === 1 && j(inFlight.log.saves) === j([true]) && noteAtSave === 'Saved to disk' && inFlight.log.order.indexOf('save') < inFlight.log.order.indexOf('POST /api/update-installer-run') && inFlight.log.timers.filter(t => t === 150).length >= 2
                        && [errSave, netSave, stuck].every(r => runs(r) === 0 && r.upd.selfFailed === true && r.els.installerModal.style.display === 'flex' && r.log.toasts.some(t => /could not be saved, so nothing was installed/.test(t))) && stuck.log.timers.filter(t => t === 150).length === 100
                        && runs(noSaver) === 1 && runs(foreign) === 1
                        && io.includes("var saveNote = document.getElementById('saveNote');") && io.includes("saveNote.innerHTML = 'Saving...';") && io.includes("else saveNote.innerHTML = 'Error saving.';") && io.includes(".catch(err => saveNote.innerHTML = 'Network error saving.');") && io.includes('window.wpSave = save;') && /function save\(immediate\) \{/.test(io) && /id="saveNote"/.test(read('system/app/index.html'));
                    e.push([inFlight.log.order, errSave.log.toasts, stuck.log.timers.length, runs(noSaver), runs(foreign)]);
                    // every way it can fail: said in one plain line, and the walk-through takes over
                    const fell = r => r.upd.selfFailed === true && r.upd.selfBusy === false && r.els.installerModal.style.display === 'flex' && r.els.installerModal.dataset.url === SELF.installer && r.els.setUpdateInstallerBtn.textContent === 'Get Installer' && r.els.setUpdateInstallerBtn.disabled === false && r.els.updateBtn.disabled === false && r.els.updateBtn.textContent === '⬆️ Update to 1.5.1'
                        && r.log.toasts.length >= 1 && /^Waypoint could not update itself/.test(r.log.toasts[r.log.toasts.length - 1]) && /Get Installer shows the steps instead\.$/.test(r.log.toasts[r.log.toasts.length - 1]) && r.log.toasts.every(t => !/[<>]/.test(t) && t.length <= 300) && runs(r) <= 1 && r.log.late.length === 0;
                    const R = (o) => Object.assign({ '/api/update-installer': { ok: true }, '/api/update-installer-status': { state: 'ready' }, '/api/update-installer-run': { ok: true } }, o);
                    const refusedStart = await go({ onSave: saved, routes: R({ '/api/update-installer': { ok: false, error: 'this copy cannot install an update by itself' } }) });
                    const oldShell = await go({ onSave: saved, routes: R({ '/api/update-installer': NOJSON }) }), netStart = await go({ onSave: saved, routes: R({ '/api/update-installer': new Error('Failed to fetch') }) });
                    const failedDl = await go({ onSave: saved, routes: R({ '/api/update-installer-status': n => n < 2 ? { state: 'downloading', got: 1, total: 2 } : { state: 'failed', error: '<img src=x onerror=alert(1)>\n' + 'x'.repeat(500) } }) });
                    const unsigned = await go({ onSave: saved, routes: R({ '/api/update-installer-status': { state: 'failed', error: 'unsigned update — refused' } }) });
                    const stopped = await go({ onSave: saved, routes: R({ '/api/update-installer-status': { state: 'idle' } }) }), oddState = await go({ onSave: saved, routes: R({ '/api/update-installer-status': { state: 42 } }) });
                    const silent = await go({ onSave: saved, routes: R({ '/api/update-installer-status': NOJSON }) }), blip = await go({ onSave: saved, routes: R({ '/api/update-installer-status': n => n < 3 ? new Error('Failed to fetch') : { state: 'ready' } }) });
                    const refusedRun = await go({ onSave: saved, routes: R({ '/api/update-installer-run': { ok: false, error: 'the installer changed after it was checked — not run' } }) }), deadRun = await go({ onSave: saved, routes: R({ '/api/update-installer-run': NOJSON }) });
                    const statusAsks = r => r.log.order.filter(x => x === 'GET /api/update-installer-status').length;
                    const again = refusedStart; again.els.installerModal.style.display = 'none'; again.els.setUpdateInstallerBtn.click(); await flush();
                    okF = [refusedStart, oldShell, netStart, failedDl, unsigned, stopped, oddState, silent, refusedRun, deadRun].every(fell)
                        && /: this copy cannot install an update by itself\. Get/.test(refusedStart.log.toasts[1]) && statusAsks(refusedStart) === 0 && statusAsks(oldShell) === 0 && runs(failedDl) === 0 && /: unsigned update — refused\. Get/.test(unsigned.log.toasts[1]) && /: the download stopped\. Get/.test(stopped.log.toasts[1]) && /: the download stopped\. Get/.test(oddState.log.toasts[1])
                        && statusAsks(silent) === 3 && /: Waypoint stopped answering\. Get/.test(silent.log.toasts[1]) && runs(silent) === 0 && statusAsks(blip) === 3 && runs(blip) === 1 && blip.upd.selfFailed === false
                        && runs(refusedRun) === 1 && /: the installer changed after it was checked — not run\. Get/.test(refusedRun.log.toasts[refusedRun.log.toasts.length - 1]) && runs(deadRun) === 1
                        && again.els.installerModal.style.display === 'flex' && again.log.confirms.length === 1
                        && j(['plain', 'a<b>c', 'two\nlines\tand\u0000more', 'x'.repeat(300), 7, null, undefined, {}].map(v => refusedStart.api.plainLine(v))) === j(['plain', 'a b c', 'two lines and more', 'x'.repeat(200), '', '', '', ''])
                        && j([115343360, 1, 1048576, 0, -1, NaN, '5', null].map(v => refusedStart.api.mbOf(v))) === j([110, 1, 1, 0, 0, 0, 0, 0]);
                    e.push([[refusedStart, oldShell, netStart, failedDl, unsigned, stopped, oddState, silent, refusedRun, deadRun].map(r => [fell(r), r.log.toasts[r.log.toasts.length - 1].slice(0, 90)]), statusAsks(silent), statusAsks(blip), runs(blip)]);
                } catch (err) { e.push('threw: ' + (err && err.stack || err)); }
            }
            check('Settings, the notice bar and the header button say Update — and the notice one click — for an update that changes the core only when the shell says this copy can install it by itself (canSelfInstall true, nothing else); otherwise they say Get Installer and that the steps come first, as before; a one-click update of the app files reads as before', !!src && okA, e[0]);
            check('the core update asks first in the app\'s own words, built from cleaned values only (both versions, the size as whole megabytes from a number, nothing when it is no number); No starts nothing; a release naming no plain version goes to the walk-through unasked; at a multiplayer table it is refused in the one-click update\'s words; each of the three controls asks the same', okB, e[1]);
            check('Yes starts the download and asks the shell how it stands about once a second, showing the progress as text beside the Updates heading and on the header button (a percentage when the length is known, megabytes when it is not, then the check); when it is ready the campaign is saved first, then "Waypoint is closing to update…" is said and Run is asked — the buttons off meanwhile, no reload', okC, e[2]);
            check('a core update that was started and did not finish (the shell says installFailed) is said once in the notice bar — "The update to B did not finish. Try Update again, or use Get Installer." — with both ways on and Dismiss; each answer tells the shell to forget it and gives the bar its usual buttons back; a version that is no plain version raises no notice; a minute after Run, with Waypoint still open, the page checks again and says so', okD, e[3]);
            check('nothing unsaved is lost: a save already under way ends first, the campaign is then saved at once and its own answer waited for; a save that ends in an error, or never ends, starts no installer and falls back; a campaign that is not this machine\'s to save (the GM\'s table) holds nothing up — and io.js still speaks the save note\'s words the page reads', okE, e[4]);
            check('any failure is said in one plain line (the shell\'s words cleaned and cut to 200 characters) and the walk-through takes over, with Get Installer back on every control: the start refused, a shell that has no such route, the network, a download that failed or stopped, a shell that stops answering (three tries; one that answers again goes on), Run refused or unanswered; pressing the button again then opens the steps, never the download', okF, e[5]);

            /* ---- 1.5.5, the same notice on the welcome screen (the owner, 2026-10-24, by prompt: "A strip above the cards": "The same words and
               buttons as the app's update banner, at the top of the welcome screen: Update, Notes, Later. Update starts the same update as the top
               row's button."). The strip (#wcUpdate) shows exactly while the notice bar shows, with the bar's words, and each of its buttons presses
               the bar's own; Update and Notes first put the welcome aside as Enter Waypoint does, and Later keeps it, its one notice lifted over it.
               Run for real on the page of plain objects with the strip's elements beside the bar's; and the bar on a page with no strip at all is
               what it is on a page with the strip, scenario for scenario ---- */
            const STRIP = ['wcUpdate', 'wcUpdateText', 'wcUpdateGo', 'wcUpdateNotes', 'wcUpdateLater'], WC = STRIP.concat(['welcomeScreen', 'wcEnterBtn', 'toast', 'wcMain']);
            // a page with the welcome up (o.welcome false: put away), the bar's and the strip's words as the page writes them, Enter Waypoint putting the
            // welcome away as main.js does (noted with how many questions had been asked by then), Settings' Notes noted, a toast element whose classes
            // each notice sets anew as io.js's toast does (className = 'show'), and the welcome's main view, where the focus is put noted with its
            // tabindex; o.bare: the same page with none of the strip, the welcome, the main view or the toast element on it
            const wcPage = (info, o) => {
                o = o || {}; const cls = new Set(), r = pageOf(info, Object.assign({}, o, { onToast: () => { cls.clear(); cls.add('show'); } }));
                r.els.updateBannerNotes.textContent = 'Notes'; r.els.updateBannerLater.textContent = 'Later';
                r.ui('setUpdateNotesBtn').addEventListener('click', () => { r.log.order.push('notes'); });
                if (o.bare) return r;
                STRIP.forEach(r.ui); r.els.wcUpdateText.textContent = 'A new version of Waypoint is available.'; r.els.wcUpdateGo.textContent = 'Update'; r.els.wcUpdateNotes.textContent = 'Notes'; r.els.wcUpdateLater.textContent = 'Later';
                r.ui('welcomeScreen').style.display = o.welcome === false ? 'none' : 'flex';
                r.ui('wcEnterBtn').addEventListener('click', () => { r.log.order.push('enter@' + r.log.confirms.length); r.els.welcomeScreen.style.display = 'none'; });
                r.els.toast = { id: 'toast', cls, classList: { add(c) { cls.add(c); } } };
                const main = r.ui('wcMain'); main.attrs = {}; main.setAttribute = (k, v) => { main.attrs[k] = String(v); }; r.focus = []; main.focus = () => { r.focus.push('wcMain:' + main.attrs.tabindex); };
                return r;
            };
            const stripOf = r => [r.els.wcUpdate.style.display, r.els.wcUpdateText.textContent, r.els.wcUpdateGo.textContent, r.els.wcUpdateNotes.textContent, r.els.wcUpdateLater.textContent];
            const barOf = r => [r.els.updateBanner.style.display, r.els.updateBannerText.textContent, r.els.updateBannerGo.textContent, r.els.updateBannerNotes.textContent, r.els.updateBannerLater.textContent];
            const routesOf = (info, more) => Object.assign({ '/api/update-check': info, '/api/update-installer-dismiss': { ok: true }, '/api/update-apply': { ok: true, version: '1.5.1' } }, more || {});
            const UPTO = { current: '1.5.0', latest: '1.5.0', newer: false }, INST = Object.assign({}, SELF, { canSelfInstall: false }), FAIL = Object.assign({}, SELF, { installFailed: '1.5.1' });
            const ONE = 'Waypoint Alpha 1.5.1 is available — one click to update.', STEPS = 'Waypoint Alpha 1.5.1 is available — this one comes as an installer; Update shows the steps first.', NOTE = 'The update to 1.5.1 did not finish. Try Update again, or use Get Installer.';
            const LATER = 'The Update button stays in the top bar until you update.';
            let okS1 = false, okS2 = false, okS3 = false, okS4 = false, okS5 = false, okS6 = false, okS7 = false, okSD = false, sx = [];
            if (src) {
                try {
                    // shown and hidden with the bar, with its words: no update, a one-click update of the app files and of the core, the installer's case
                    const shownBy = async info => { const r = wcPage(null, { routes: routesOf(info) }); await r.api.checkUpdates(false, true); return [stripOf(r), barOf(r)]; };
                    const none = await shownBy(UPTO), hot = await shownBy(HOT), self = await shownBy(SELF), inst = await shownBy(INST);
                    okS1 = none[0][0] === 'none' && none[1][0] === 'none'
                        && j(hot[0]) === j(['flex', ONE, 'Update', 'Notes', 'Later']) && j(hot[1]) === j(hot[0]) && j(self[0]) === j(['flex', ONE, 'Update', 'Notes', 'Later']) && j(self[1]) === j(self[0])
                        && j(inst[0]) === j(['flex', STEPS, 'Get Installer', 'Notes', 'Later']) && j(inst[1]) === j(inst[0]);
                    sx.push([none, hot, self, inst]);
                    // Update: the welcome put aside first, as Enter Waypoint does, then the bar's own button: the same question and the same update as the
                    // bar's own button and the top row's; with the welcome already put away nothing is pressed for it
                    const via = async (info, press, o) => { const r = wcPage(info, Object.assign({ routes: routesOf(info) }, o)); r.api.showUpdateBanner(info); r.els[press].click(); await flush(); return r; };
                    const hS = await via(HOT, 'wcUpdateGo'), hB = await via(HOT, 'updateBannerGo'), hT = await via(HOT, 'updateBtn');
                    const asked = [hS, hB, hT].map(r => r.log.confirms.slice()), welcomeAt = hS.els.welcomeScreen.style.display;
                    const shownAt = [hS, hB, hT].map(r => [barOf(r)[0], stripOf(r)[0]]);   // the bar's own Update leaves the bar up for an update of the app files; the top row's puts it away first
                    [hS, hB, hT].forEach(r => r.st.cb(true)); await flush();
                    const went = r => j([r.log.order.filter(x => !/^enter@/.test(x)), r.log.reloads, r.log.toasts, r.log.posted]);
                    const sS = await via(SELF, 'wcUpdateGo'), sB = await via(SELF, 'updateBannerGo'), away = await via(HOT, 'wcUpdateGo', { welcome: false });
                    okS3 = hS.log.order[0] === 'enter@0' && welcomeAt === 'none' && asked.every(a => a.length === 1 && a[0] === asked[0][0]) && /^Update Waypoint from Alpha 1\.5\.0 to Alpha 1\.5\.1\? The new version downloads/.test(asked[0][0])
                        && went(hS) === went(hB) && went(hS) === went(hT) && hS.log.order.indexOf('POST /api/update-apply') > 0 && hS.log.reloads === 1
                        && sS.log.order[0] === 'enter@0' && j(sS.log.confirms) === j([ASK]) && j(sB.log.confirms) === j([ASK])
                        && hB.log.order.every(x => !/^enter@/.test(x)) && hT.log.order.every(x => !/^enter@/.test(x)) && away.log.order.every(x => !/^enter@/.test(x)) && away.log.confirms.length === 1
                        && j(shownAt) === j([['flex', 'flex'], ['flex', 'flex'], ['none', 'none']]);
                    sx.push([hS.log.order, asked, went(hS), went(hB), sS.log.order, sS.log.confirms, away.log.order, shownAt]);
                    // Notes: the welcome put aside first, then the bar's own Notes, which opens Settings' release notes
                    const nS = await via(HOT, 'wcUpdateNotes'), nB = await via(HOT, 'updateBannerNotes');
                    okS4 = j(nS.log.order) === j(['enter@0', 'notes']) && j(nB.log.order) === j(['notes']) && nS.els.welcomeScreen.style.display === 'none' && nS.log.confirms.length === 0 && stripOf(nS)[0] === 'flex';
                    sx.push([nS.log.order, nB.log.order]);
                    // Later: the bar and the strip both put away for this run and said as the bar's Later says it, the notice lifted over the welcome, which
                    // stays; a later check brings neither back
                    const lS = wcPage(HOT, { routes: routesOf(HOT) }); lS.api.showUpdateBanner(HOT); const lUp = stripOf(lS)[0]; lS.els.wcUpdateLater.click(); await flush();
                    const lB = wcPage(HOT, { routes: routesOf(HOT) }); lB.api.showUpdateBanner(HOT); lB.els.updateBannerLater.click(); await flush();
                    const lSay = lS.log.toasts.slice(), lLift = j([...lS.els.toast.cls].sort()) === j(['show', 'wc-over']), lBare = j([...lB.els.toast.cls]) === j(['show']), lFocus = lS.focus.slice(); await lS.api.checkUpdates(true, true);
                    okS5 = lUp === 'flex' && j(lSay) === j([LATER]) && j(lB.log.toasts) === j([LATER]) && lLift && !lB.els.toast.cls.has('wc-over') && lBare && j(lFocus) === j(['wcMain:-1']) && lB.focus.length === 0 && lS.els.welcomeScreen.style.display === 'flex'
                        && lS.log.order.every(x => !/^enter@/.test(x)) && stripOf(lS)[0] === 'none' && barOf(lS)[0] === 'none' && stripOf(lB)[0] === 'none' && barOf(lB)[0] === 'none';
                    sx.push([lUp, lSay, lLift, [...lS.els.toast.cls], [...lB.els.toast.cls], lFocus, lB.focus, stripOf(lS), barOf(lS)]);
                    // the notice of an update that did not finish: the bar's words and buttons, Dismiss keeping the welcome and saying nothing, Get Installer and
                    // Update each putting the welcome aside first, then the bar's own way on
                    const failed = async () => { const r = wcPage(null, { routes: routesOf(FAIL) }); await r.api.checkUpdates(false, true); return r; };
                    const f1 = await failed(), fUp = stripOf(f1), fBar = barOf(f1); f1.els.wcUpdateLater.click(); await flush();
                    const f2 = await failed(); f2.els.wcUpdateNotes.click(); await flush();
                    const f3 = await failed(); f3.els.wcUpdateGo.click(); await flush();
                    const at = (r, x) => r.log.order.indexOf(x);
                    okS6 = j(fUp) === j(['flex', NOTE, 'Update', 'Get Installer', 'Dismiss']) && j(fBar) === j(fUp)
                        && j(stripOf(f1)) === j(['none', NOTE, 'Update', 'Notes', 'Later']) && j(barOf(f1)) === j(['none', NOTE, 'Update', 'Notes', 'Later']) && at(f1, 'POST /api/update-installer-dismiss') > 0 && f1.log.toasts.length === 0 && !f1.els.toast.cls.has('wc-over')
                        && f1.els.welcomeScreen.style.display === 'flex' && f1.log.order.every(x => !/^enter@/.test(x)) && f1.upd.failNote === '' && j(f1.focus) === j(['wcMain:-1']) && f2.focus.length === 0 && f3.focus.length === 0
                        && at(f2, 'enter@0') > 0 && at(f2, 'enter@0') < at(f2, 'POST /api/update-installer-dismiss') && f2.els.installerModal.style.display === 'flex' && f2.els.installerVersion.textContent === 'Waypoint Alpha 1.5.1' && stripOf(f2)[0] === 'none' && f2.log.confirms.length === 0
                        && at(f3, 'enter@0') > 0 && at(f3, 'enter@0') < at(f3, 'POST /api/update-installer-dismiss') && j(f3.log.confirms) === j([ASK]) && stripOf(f3)[0] === 'none';
                    sx.push([fUp, fBar, stripOf(f1), f1.log.order, f2.log.order, f3.log.order, f3.log.confirms]);
                    // hidden again whenever the bar is: here the core update said Yes to, which puts the bar away, and then fails to the installer's steps
                    const y = wcPage(SELF, { routes: routesOf(SELF, { '/api/update-installer': { ok: false, error: 'not here' } }) }); y.api.showUpdateBanner(SELF); const yUp = stripOf(y)[0];
                    y.els.wcUpdateGo.click(); await flush(); y.st.cb(true); await flush();
                    okS7 = yUp === 'flex' && stripOf(y)[0] === 'none' && barOf(y)[0] === 'none' && y.els.installerModal.style.display === 'flex' && y.upd.selfFailed === true;
                    sx.push([yUp, stripOf(y), barOf(y), y.log.toasts]);
                    // the strip's Update is off while the bar's is: an update of the app files said Yes to downloads with the bar's Update off and the strip's
                    // with it; the welcome brought back from the top row's mark meanwhile, a press of the strip's Update does nothing (in a browser a button
                    // that is off is not pressed; this page presses it all the same, so the strip's own guard is what holds); the download failing turns
                    // both on again
                    let release = null; const pend = new Promise(res => { release = res; });
                    const dz = wcPage(HOT, { routes: routesOf(HOT, { '/api/update-apply': pend }) }); dz.api.showUpdateBanner(HOT); const dzOn = [dz.els.updateBannerGo.disabled, dz.els.wcUpdateGo.disabled];
                    dz.els.wcUpdateGo.click(); await flush(); dz.st.cb(true); await flush();
                    const dzOff = [dz.els.updateBannerGo.disabled, dz.els.wcUpdateGo.disabled, dz.els.wcUpdateNotes.disabled, dz.els.wcUpdateLater.disabled, stripOf(dz)[0]];
                    dz.els.welcomeScreen.style.display = 'flex'; const dzAt = dz.log.order.length; dz.els.wcUpdateGo.click(); await flush();
                    const dzPressed = dz.log.order.slice(dzAt), dzAsked = dz.log.confirms.length, dzWc = dz.els.welcomeScreen.style.display;
                    release({ ok: false, error: 'not now' }); await flush();
                    const dzBack = [dz.els.updateBannerGo.disabled, dz.els.wcUpdateGo.disabled, stripOf(dz)[0]];
                    okSD = j(dzOn) === j([false, false]) && j(dzOff) === j([true, true, false, false, 'flex']) && dzPressed.length === 0 && dzAsked === 1 && dzWc === 'flex' && dz.log.reloads === 0
                        && j(dzBack) === j([false, false, 'flex']) && dz.log.toasts.some(t => t === 'Update failed: not now');
                    sx.push([dzOn, dzOff, dzPressed, dzAsked, dzWc, dzBack, dz.log.toasts]);
                } catch (err) { sx.push('threw: ' + (err && err.stack || err)); }
            }
            check('1.5.5 the welcome screen\'s update strip shows exactly while the notice bar shows, with the bar\'s words and its buttons\' words, set as text (run for real): put away with no update; shown for a one-click update of the app files or of the core with Update, and for the installer\'s case with Get Installer', !!src && okS1, sx[0]);
            check('1.5.5 the strip\'s Update puts the welcome aside first, as Enter Waypoint does, and then presses the bar\'s own button, never the top row\'s, so the bar stays up as after the bar\'s own Update: the same question and the same update as the bar\'s button and the top row\'s, for the app files and for the core; with the welcome already put away nothing is pressed for it', okS3, sx[1]);
            check('1.5.5 the strip\'s Notes puts the welcome aside first, then presses the bar\'s own Notes, which opens the release notes', okS4, sx[2]);
            check('1.5.5 the strip\'s Later presses the bar\'s own: both are put away for this run and it is said as the bar\'s Later says it, that notice lifted over the welcome screen once it is said (io.js\'s toast sets its classes anew), which stays, its main view taking the focus as the strip goes; a later check brings neither back', okS5, sx[3]);
            check('1.5.5 the notice of an update that did not finish shows on the strip with the bar\'s words, Update, Get Installer and Dismiss: Dismiss keeps the welcome, its main view taking the focus, says nothing and gives both their usual buttons back; Get Installer and Update put the welcome aside first, then go on as the bar\'s do', okS6, sx[4]);
            check('1.5.5 the strip is hidden again whenever the bar is, here by the core update said Yes to, which then falls back to the installer\'s steps', okS7, sx[5]);
            check('1.5.5 the strip\'s Update is off while the bar\'s is: as an update of the app files downloads, and on again when it fails; a press of it meanwhile, the welcome brought back from the top row\'s mark, does nothing, as the bar\'s does nothing', okSD, sx[6]);
            // the bar itself is what it was: each scenario run on a page with the strip and on one with none of it, pressing the bar's own buttons, ends the same
            let okS8 = false, s8 = [];
            if (src) {
                try {
                    const both = async (info, act) => { const out = []; for (const bare of [true, false]) { const r = wcPage(null, bare ? { bare: true, missing: WC, routes: routesOf(info) } : { routes: routesOf(info) }); await act(r); out.push(j([barOf(r), r.log.order, r.log.confirms, r.log.toasts, r.log.reloads, r.log.posted, r.els.installerModal.style.display, r.els.installerModal.dataset, r.els.updateBtn.textContent, r.els.updateBtn.style.display, r.upd])); } return out; };
                    const check1 = r => r.api.checkUpdates(false, true);
                    const runs = [
                        await both(UPTO, check1),
                        await both(HOT, async r => { await check1(r); r.els.updateBannerGo.click(); await flush(); r.st.cb(true); await flush(); }),
                        await both(SELF, async r => { await check1(r); r.els.updateBannerGo.click(); await flush(); r.st.cb(false); await flush(); }),
                        await both(INST, async r => { await check1(r); r.els.updateBannerGo.click(); await flush(); }),
                        await both(HOT, async r => { await check1(r); r.els.updateBannerLater.click(); await flush(); await r.api.checkUpdates(true, true); }),
                        await both(HOT, async r => { await check1(r); r.els.updateBannerNotes.click(); await flush(); }),
                        await both(FAIL, async r => { await check1(r); r.els.updateBannerLater.click(); await flush(); }),
                        await both(FAIL, async r => { await check1(r); r.els.updateBannerNotes.click(); await flush(); }),
                        await both(SELF, async r => { await check1(r); r.els.updateBtn.click(); await flush(); })];
                    okS8 = runs.every(p => p[0] === p[1]); s8 = runs.filter(p => p[0] !== p[1]);
                } catch (err) { s8 = 'threw: ' + (err && err.stack || err); }
            }
            check('1.5.5 the notice bar, the top row\'s Update button and what they do are as before: each of nine scenarios (no update, an update of the app files said Yes to, of the core said No to, the installer\'s case, Later and a check after, Notes, and the unfinished update\'s Dismiss and Get Installer, and the top row\'s button) ends the same on a page with the strip as on a page with none of it', okS8, s8);
            const ixS = read('system/app/index.html'), cssS = read('system/app/style.css'), stS = read('system/app/scripts/settings.js');
            const mA = ixS.indexOf('<div id="wcMain">'), mB = ixS.indexOf('<div class="wc-actions">', mA), headS = mA > 0 && mB > mA ? ixS.slice(mA, mB) : '';
            const tagOf = id => (ixS.match(new RegExp('<button class="([^"]*)" id="' + id + '" title="([^"]*)">([^<]*)</button>')) || []).slice(1);
            const zTagS = id => +((ixS.match(new RegExp(' id="' + id + '"[^>]*? style="[^"]*?z-index: ?(\\d+)')) || [])[1]);
            const lift = +((cssS.match(/\n  #toast\.show\.wc-over \{ z-index: (\d+); transition: opacity \.2s, transform \.2s; \}\n/) || [])[1]);
            const ruleS = (cssS.match(/\n  #wcUpdate \{([^}]*)\}/) || [])[1] || '', barRule = (cssS.match(/\n  #updateBanner \{([^}]*)\}/) || [])[1] || '';
            const partS = (r, p) => (r.match(new RegExp('(?:^|[;{\\s])' + p + ': ?([^;]+);')) || [])[1];
            const LOOK = ['background', 'border', 'border-radius', 'box-shadow', 'font-size', 'color', 'padding', 'gap', 'align-items'];
            check('1.5.5 the strip as the page has it: the first thing of the welcome\'s main view, above its cards, put away in the page, with the bar\'s first words and its three buttons as the bar\'s, the tooltips the same; it wears the bar\'s ground, edge, radius, shadow, words and buttons, in the welcome\'s flow (never fixed) and wrapping on a narrow screen; a website whose plan joins tables alone puts it away beside the bar; and the notice its Later says stands over the welcome screen and under the installer\'s steps and every question, going back under the welcome only once it has faded; the strip is no live region of its own beside the bar\'s, which says the same words; and the main view takes the focus with no ring of its own',
                /^<div id="wcMain">\s*<!--[^\n]*-->\s*<div id="wcUpdate" style="display:none;">\s*<span id="wcUpdateText">A new version of Waypoint is available\.<\/span>\s*<button class="tool" id="wcUpdateGo" title="Update now">Update<\/button>\s*<button class="tool ghost" id="wcUpdateNotes" title="Release notes">Notes<\/button>\s*<button class="tool ghost" id="wcUpdateLater" title="Hide this until the next version">Later<\/button>\s*<\/div>\s*$/.test(headS)
                && j(tagOf('wcUpdateGo')) === j(tagOf('updateBannerGo')) && j(tagOf('wcUpdateNotes')) === j(tagOf('updateBannerNotes')) && j(tagOf('wcUpdateLater')) === j(tagOf('updateBannerLater')) && tagOf('updateBannerGo').length === 3
                && /<span id="updateBannerText">A new version of Waypoint is available\.<\/span>/.test(ixS) && STRIP.every(id => ixS.split('id="' + id + '"').length === 2)
                && LOOK.every(p => partS(ruleS, p) !== undefined && partS(ruleS, p) === partS(barRule, p)) && partS(ruleS, 'flex-wrap') === 'wrap' && !/position|top|left|transform|z-index|max-width/.test(ruleS)
                && /\n  #wcUpdate \.tool \{ padding: 4px 12px; font-size: 12px; \}\n/.test(cssS) && /\n  #updateBanner \.tool \{ padding: 4px 12px; font-size: 12px; \}\n/.test(cssS) && /\n  #wcUpdateText \{ flex: 1 1 220px; min-width: 0; overflow-wrap: anywhere; \}\n  @media \(max-width: 560px\) \{ #wcUpdateText \{ flex-basis: 100%; \} \}[^\n]*\n/.test(cssS)
                && /\n  body\.web-join #updateBtn, body\.web-join #updateBanner, body\.web-join #installerModal, body\.web-join #wcUpdate,\n/.test(cssS)
                && zTagS('welcomeScreen') === 100000 && lift > zTagS('welcomeScreen') && lift < zTagS('installerModal') && lift < zTagS('customConfirm')
                && /<div id="updateBanner" role="status" style="display:none;">/.test(ixS) && !/<div id="wcUpdate"[^>]*role=/.test(ixS)
                && /\n  #toast\{\n[^}]*;transition:opacity \.2s,transform \.2s,z-index 0s \.2s;z-index:99995;/.test(cssS) && /\n  #wcMain:focus \{ outline: none; \}/.test(cssS),
                j([headS.slice(0, 200), lift, zTagS('welcomeScreen'), zTagS('installerModal'), LOOK.map(p => [partS(ruleS, p), partS(barRule, p)])]));
            check('1.5.5 the bar\'s own show and hide each end in the strip, the core\'s notice too: wcStrip is called six times, by showUpdateBanner, hideUpdateBanner (which endFailNote ends in, after it gives the bar its usual words back), showFailNote and coreNudge right after it shows the bar, and by runHotUpdate right after it turns the bar\'s Update off and on again, and nowhere else',
                (stS.match(/wcStrip\(\);/g) || []).length === 6 && /\n            btns\.forEach\(function\(b\) \{ if \(b\) b\.disabled = true; \}\); wcStrip\(\);\n/.test(stS) && /\}\)\.catch\(function\(e\) \{ btns\.forEach\(function\(b\) \{ if \(b\) b\.disabled = false; \}\); wcStrip\(\); toast\('Update failed: '/.test(stS) && /\n        bar\.style\.display = 'flex';\n        wcStrip\(\);[^\n]*\n    \}\n    updateUI\(\);\n    if \(firstTime\) \{/.test(stS)
                && /function hideUpdateBanner\(\) \{ var bar = ui\('updateBanner'\); if \(bar\) bar\.style\.display = 'none'; wcStrip\(\); \}/.test(stS)
                && /\n    if \(notes\) notes\.textContent = 'Notes'; if \(later\) later\.textContent = 'Later';\n    hideUpdateBanner\(\);\n/.test(stS), (stS.match(/wcStrip\(\);/g) || []).length);
        }

        /* ================= C. the words ================= */
        {
            const ix = read('system/app/index.html'), st = read('system/app/scripts/settings.js'), tu = read('system/app/scripts/tutorial.js'), rd = read('README.md');
            const first = fs.readdirSync(ROOT).filter(f => /^READ ME FIRST/.test(f)).map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join(NL);
            const a = ix.indexOf('<div id="installerModal"'), b = ix.indexOf('<!-- VTT features at a joined table', a), modal = a > 0 && b > a ? ix.slice(a, b) : '';
            const coaching = /Run anyway|More info/i;
            check('the installer dialog no longer tells anyone to click past the Windows warning: it says the installer is not code-signed yet and to run only a Waypoint_Setup.exe downloaded through its own button or from Waypoint\'s own releases page; the other steps stand; settings.js, the README and the install instructions say no such thing either',
                modal.length > 500 && !coaching.test(modal) && /Windows may warn that it does not recognise the publisher: Waypoint's installer is not code-signed yet\. Only run a <b>Waypoint_Setup\.exe<\/b> you downloaded through this button or from Waypoint's own releases page; if it came from anywhere else, do not run it\./.test(modal)
                && (modal.match(/<li>/g) || []).length === 5 && /close Waypoint<\/b> and run the file/.test(modal) && /Update this copy in place/.test(modal) && !coaching.test(ix) && !coaching.test(st) && !coaching.test(rd) && !coaching.test(first) && first.length > 100
                && /not code-signed yet/.test(rd) && /do not run it/.test(rd) && /not code-signed yet/.test(first) && /do not run it/.test(first) && /never one from anywhere else/.test(st), j([modal.length, coaching.test(modal), coaching.test(st), coaching.test(rd), coaching.test(first)]));
            const hA = ix.indexOf('id="helpModal"'), hB = ix.indexOf('<!-- An update that needs the installer'), help = hA > 0 && hB > hA ? ix.slice(hA, hB) : '';
            const step = (tu.match(/\{ target: '#settingsBtn', title: 'Settings',\s*html: '([^\n]*)',\n/) || [])[1] || '';
            const g = ix.indexOf('<details class="set-group" data-group="updates">'), gEnd = ix.indexOf('</details>', g), group = g > 0 ? ix.slice(g, gEnd) : '';
            check('the Restore button is in Settings under Updates & about, hidden until the shell says there is something to restore; Help says it (an Updates section: a signed update, the way back) and the tour\'s Settings step names the button',
                /<button class="tool ghost" id="setUpdateRestoreBtn" style="display:none;[^"]*"[^>]*>Restore the previous version<\/button>/.test(group) && /<h4>Updates<\/h4>/.test(help) && /<b>Restore the previous version<\/b>/.test(help) && /signature/.test(help) && /refused/.test(help)
                && /<b>Restore the previous version<\/b>/.test(step), j([group.length, help.length, step.length]));
            const upA = help.indexOf('<h4>Updates</h4>'), upB = help.indexOf('</ul>', upA), ups = upA > 0 ? help.slice(upA, upB) : '';
            const introCore = (modal.match(/<p id="installerIntroCore"[^>]*>([^\n]*)<\/p>/) || [])[1] || '', introNormal = (modal.match(/<p id="installerIntroNormal"[^>]*>([^\n]*)<\/p>/) || [])[1] || '';
            check('Help says that an update which changes Waypoint\'s core is one click too — it downloads, is checked as Waypoint\'s own, Waypoint closes, it installs and Waypoint opens again — and that Get Installer remains where that cannot be done; the walk-through an older core sees says that from 1.5.0 on such updates install themselves; the Settings button\'s first words are still Get Installer (the page renames it only when the shell says it can)',
                /An update that changes Waypoint&rsquo;s core is one click too/.test(ups) && /closes Waypoint/.test(ups) && /opens Waypoint again/.test(ups) && /signature/.test(ups) && /<b>Get Installer<\/b>/.test(ups) && /multiplayer session/.test(ups) && (ups.match(/<li>/g) || []).length === 5 /* moved on purpose in 1.5.9: a fifth point says an update keeps an outside sheet reader */&& /Where that cannot be done, <b>Get Installer<\/b> shows the steps before anything downloads\./.test(ups) && /a copy older than 1\.5\.0, a copy the installer did not put there, and a download that fails/.test(ups)
                && /From Waypoint 1\.5\.0 on, updates like this one install themselves\./.test(introCore) && /cannot take that update by itself/.test(introNormal) && /Nothing has downloaded yet/.test(introNormal)
                && /id="setUpdateInstallerBtn"[^>]*>Get Installer<\/button>/.test(group) && /installs itself/.test(rd), j([ups.length, step.length, introCore.length, introNormal.length]));
            // 1.5.5, the welcome screen's update strip said: Help's Updates part in one plain sentence, both release notes alike under 1.5.5, and
            // this file in the web mode rule's list where it is there (the maintainer's own copy, git-ignored: a missing one passes)
            const NOTE_WC = "\nUpdates\n- When a newer Waypoint is out, the welcome screen now says so too,\n  above its cards, with the same Update, Notes and Later buttons as the\n  notice in the app. Update and Notes take you into Waypoint first, as\n  Enter Waypoint does, so you see each step of the update.\n\n";
            const notesWc = ['WHATSNEW.txt', 'system/app/assets/whatsnew.txt'].map(read);
            const mdWc = (() => { try { return read('CLAUDE.md'); } catch (e2) { if (e2 && e2.code === 'ENOENT') return null; throw e2; } })();
            check('1.5.5 the welcome screen\'s update strip is said: Help\'s Updates part says in one plain sentence that when Waypoint finds a newer version the welcome screen says so too, with the same Update, Notes and Later buttons; both release notes carry the same lines in a part of their own under 1.5.5, once; and this file names the strip in the web mode rule\'s list, where the file is there',
                /Waypoint also looks quietly at launch\. When it finds one, the welcome screen says so too, above its cards, with the same <b>Update<\/b>, <b>Notes<\/b> and <b>Later<\/b> buttons as the notice in the app\. <b>Update Now<\/b>/.test(ups)
                && notesWc.every(t => t.split(NOTE_WC).length === 2 && t.indexOf(NOTE_WC) > t.indexOf('WAYPOINT 1.5.5') && t.indexOf(NOTE_WC) < t.indexOf('WAYPOINT 1.5.4') && t.indexOf('WAYPOINT 1.5.5') >= 0)
                && (mdWc === null || mdWc.split("banner and installer window and the welcome screen's update strip (settings.js ").length === 2), j([notesWc.map(t => t.indexOf(NOTE_WC)), mdWc === null]));
        }
        /* ---- 1.5.5, a plan-aware mode: on a website the deploy is the update (webmode.js). The launch's quiet check and the snapshots list are never
           asked on a website whose plan joins tables alone, and the Updates part of Settings is put away there; a desktop asks them as before.
           settings.js's launch statement and loadSnapshots, each run for real on a page of plain objects ---- */
        {
            const stW = read('system/app/scripts/settings.js'), cssW = read('system/app/style.css');
            const lA = stW.indexOf('setTimeout(function() {\n    var Wu = window.wpWebMode;'), lB = stW.indexOf('\n}, 5000);', lA), launchW = lA >= 0 && lB > lA ? stW.slice(lA, lB + '\n}, 5000);'.length) : '';
            const runLaunch = async W => { const timers = [], log = [];
                try { new Function('setTimeout', 'window', 'checkUpdates', 'checkShell', launchW)((fn, ms) => timers.push([fn, ms]), { wpWebMode: W }, (force, quiet) => { log.push('check:' + force + ':' + quiet); return Promise.resolve(); }, () => { log.push('shell'); }); } catch (e) { return 'threw: ' + e.message; }
                const waits = timers.map(t => t[1]).join(); timers.forEach(t => t[0]()); for (let i = 0; i < 6; i++) await new Promise(r => setImmediate(r)); return waits + '|' + log.join(); };
            const sA = stW.indexOf('async function loadSnapshots() {'), sB = stW.indexOf('\n}\n', sA), snapW = sA >= 0 && sB > sA ? stW.slice(sA, sB + 3) + 'return loadSnapshots;' : '';
            const runSnaps = async W => { const asked = [], list = { innerHTML: 'Loading' };
                try { const ls = new Function('ui', 'fetch', 'window', 'showInstallerSteps', 'coreInfo', 'esc', 'snapLabel', 'fmtBytes', snapW)(id => (id === 'setSnapList' ? list : null), u => { asked.push(u); return Promise.resolve({ ok: true, json: () => Promise.resolve([]) }); }, { wpWebMode: W }, () => {}, () => ({}), s => s, () => '', () => ''); await ls(); } catch (e) { return 'threw: ' + e.message; }
                return asked.join() + '|' + list.innerHTML.replace(/<[^>]*>/g, ''); };
            const jo = { ready: Promise.resolve({ mode: 'join-only', plan: 'player', can: ['join'] }), joinOnly: () => true }, full = { ready: Promise.resolve({ mode: 'full', plan: '', can: [] }), joinOnly: () => false };
            const lw = [await runLaunch(jo), await runLaunch(full), await runLaunch(undefined), await runLaunch({ ready: Promise.resolve(null), joinOnly: () => false })];
            const sw = [await runSnaps(jo), await runSnaps(full), await runSnaps(undefined)];
            check('1.5.5 plan-aware mode: on a website whose plan joins tables alone the launch\'s quiet update check is never asked (the site\'s word waited for, the deploy being the update) and the snapshots list asks for nothing, the Updates part of Settings put away by the style sheet; a desktop asks both as before, the check once 5 s after launch and then the core',
                j(lw) === j(['5000|', '5000|check:false:true,shell', '5000|check:false:true,shell', '5000|check:false:true,shell']) && sw[0] === '|Loading' && sw[1] === '/api/backups|No snapshots yet — one is taken at every launch.' && sw[2] === sw[1]
                && /body\.web-join #settingsModal \.set-group\[data-group="updates"\]/.test(cssW) && /body\.web-join #settingsModal \.set-snaps,/.test(cssW) && /<div class="set-snaps"[^>]*>\s*<div class="set-field-label">Snapshots of the save<\/div>\s*<div id="setSnapList"/.test(read('system/app/index.html')) && /body\.web-join #updateBtn, body\.web-join #updateBanner, body\.web-join #installerModal/.test(cssW), j([lw, sw]));
        }
        /* ---- the dev server never updates the source tree it runs from (the outside audit, 2026-10-01) ----
           A scratch copy of the dev server and of the shell's files, with its own system/app and a public key made here, run as a
           child process against a signed mock release that is newer than it: never the repository's own tools/dev-server.js,
           whose Update would have swapped the repository's own system/app. */
        {
            const tree0 = path.join(tmp, 'devtree' + (++seq)), sys0 = path.join(tree0, 'system'), app0 = path.join(sys0, 'app');
            for (const f of ['tools/dev-server.js', 'system/resources/app/updater.js', 'system/resources/app/account.js', 'system/resources/app/libstore.js', 'system/resources/app/servefile.js', 'system/resources/app/reqguard.js', 'system/resources/app/shellguard.js', 'system/resources/app/package.json', 'system/resources/app/main.js']) {
                fs.mkdirSync(path.dirname(path.join(tree0, f)), { recursive: true }); if (has(f)) fs.copyFileSync(path.join(ROOT, f), path.join(tree0, f));
            }
            fs.writeFileSync(path.join(tree0, 'system/resources/app/updatekey.js'), signkey ? signkey.keyFileText(PUB) : '');
            fs.mkdirSync(path.join(app0, 'scripts'), { recursive: true });
            fs.writeFileSync(path.join(app0, 'index.html'), '<!doctype html><title>the working tree</title>'); fs.writeFileSync(path.join(app0, 'scripts', 'wip.js'), '// work that was never committed' + NL);
            const api = publish({ tag: '99.0.0' });
            const freePort = () => new Promise(r => { const s = http.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
            // start the scratch dev server with (or without) WAYPOINT_SYSTEM_DIR, ask it, stop it
            async function devRun(named, asks) {
                const port = await freePort(), saves = path.join(tmp, 'devsaves' + (++seq)), env = cleanEnv({ WAYPOINT_UPDATE_API: api });
                delete env.WAYPOINT_SYSTEM_DIR; if (named !== undefined) env.WAYPOINT_SYSTEM_DIR = named;
                const child = cp.spawn(process.execPath, [path.join(tree0, 'tools', 'dev-server.js'), saves, String(port)], { stdio: ['ignore', 'pipe', 'pipe'], env });
                const up = await new Promise(resolve => { let out = ''; const t = setTimeout(() => resolve(false), 15000); child.stdout.on('data', c => { out += c; if (/Waypoint dev server: http/.test(out)) { clearTimeout(t); resolve(true); } }); child.on('exit', () => { clearTimeout(t); resolve(false); }); });
                const ask = (method, p) => new Promise(resolve => {
                    const rq = http.request({ host: '127.0.0.1', port, method, path: p, agent: false }, rs => { let d = ''; rs.on('data', c => { d += c; }); rs.on('end', () => { let jn = null; try { jn = JSON.parse(d); } catch (e) { jn = null; } resolve({ code: rs.statusCode, json: jn || {} }); }); });
                    rq.on('error', e => resolve({ code: 0, json: { error: String(e && e.code) } })); rq.setTimeout(60000, () => { const e = new Error('no answer'); e.code = 'ETIMEDOUT'; rq.destroy(e); }); rq.end();
                });
                const out = [];
                try { if (up) for (const a of asks) out.push(await ask(a[0], a[1])); }
                finally { await new Promise(r => { if (child.exitCode !== null) return r(); const t = setTimeout(r, 3000); child.on('exit', () => { clearTimeout(t); r(); }); try { child.kill(); } catch (e) { r(); } }); }
                return { up, out };
            }
            const asks = [['GET', '/api/update-check?force=1'], ['POST', '/api/update-apply'], ['POST', '/api/update-rollback'], ['POST', '/api/update-installer'], ['GET', '/api/update-check?force=1']];
            const refusedAll = r => r.up && r.out.length === 5 && r.out[0].code === 200 && r.out[0].json.newer === true && r.out[0].json.latest === '99.0.0' && r.out[4].code === 200 && r.out[4].json.newer === true
                && [1, 2, 3].every(i => r.out[i].code === 409 && r.out[i].json.ok === false && /WAYPOINT_SYSTEM_DIR/.test(String(r.out[i].json.error)));
            const before = tree(sys0), zipHits0 = hitsOf(api, 'waypoint-app-99.0.0.zip');
            const bare = await devRun(undefined, asks), afterBare = tree(sys0);
            const sameSpelt = process.platform === 'win32' ? sys0.toUpperCase() + path.sep : path.join(sys0, '..', 'system') + path.sep;
            const own = await devRun(sameSpelt, asks), ownPlain = await devRun(sys0, asks), empty = await devRun('', asks), afterOwn = tree(sys0);
            check('the dev server never updates the source tree it runs from (a scratch copy of it, run for real against a signed release newer than it): with no WAYPOINT_SYSTEM_DIR, an empty one, or one that names the tree\'s own system folder under any spelling, Update, Restore and the installer route answer 409 with a plain reason, the tree — its app and its uncommitted work — is byte for byte as it was, no app.prev or app.new appears and the release\'s zip is never even downloaded; the check itself still answers that a newer release is there',
                refusedAll(bare) && refusedAll(own) && refusedAll(ownPlain) && refusedAll(empty) && afterBare === before && afterOwn === before && !fs.existsSync(path.join(sys0, 'app.prev')) && !fs.existsSync(path.join(sys0, 'app.new')) && hitsOf(api, 'waypoint-app-99.0.0.zip') === zipHits0
                && fs.readFileSync(path.join(app0, 'scripts', 'wip.js'), 'utf8') === '// work that was never committed' + NL, j([bare, own.out.map(o => o.code), ownPlain.out.map(o => o.code), empty.out.map(o => o.code), afterBare === before, afterOwn === before]));
            const scratch = install(require('../system/resources/app/package.json').version);   // the shell the dev server says it is: Restore keeps a previous app only when it is no older than the shell
            const dry = await devRun(scratch.sys, [['GET', '/api/update-check?force=1'], ['POST', '/api/update-apply'], ['POST', '/api/update-rollback']]);
            check('the dry run the dev server is for still works: with WAYPOINT_SYSTEM_DIR naming a scratch copy of system/, Update applies the signed release there and Restore puts the scratch copy back, and the tree the server runs from is still untouched',
                dry.up && dry.out.length === 3 && dry.out[0].json.newer === true && dry.out[1].code === 200 && dry.out[1].json.ok === true && dry.out[1].json.version === '99.0.0' && dry.out[2].code === 200 && dry.out[2].json.ok === true && verOf(scratch.app) === require('../system/resources/app/package.json').version
                && hitsOf(api, 'waypoint-app-99.0.0.zip') > zipHits0 && tree(sys0) === before, j([dry, verOf(scratch.app), tree(sys0) === before]));
        }
    } catch (e) { check('the suite ran to its end', false, e && e.stack || e); }

    try { if (server.closeAllConnections) server.closeAllConnections(); server.close(); } catch (e) {}
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}

    {   // 1.5.6 (the owner's ruling of 2026-10-24, via the Marketing session): Basic 3d6 is kept out of every build until it is rebuilt from the handbook's design spec
        const R0 = path.join(__dirname, '..'), rl = fs.readFileSync(path.join(R0, 'tools', 'release.js'), 'utf8'), ixS = fs.readFileSync(path.join(R0, 'system', 'app', 'index.html'), 'utf8');
        check('1.5.6 Basic 3d6 is out of every build: not in the app folder, kept for the tests in tools/fixtures, not offered by Start from, and the release build refuses one found back in the app folder before it writes anything',
            !fs.existsSync(path.join(R0, 'system', 'app', 'assets', 'systems', '3d6.json')) && fs.existsSync(path.join(R0, 'tools', 'fixtures', 'starter-3d6.json')) && !ixS.includes('<option value="3d6">')
            && rl.includes("const HELD_OUT = ['system/app/assets/systems/3d6.json'], heldOut = HELD_OUT.filter(f => fs.existsSync(path.join(ROOT, f)));") && rl.indexOf('HELD_OUT') < rl.indexOf("const dist = path.join(ROOT, 'dist', VERSION);"));
    }

    summed = true;
    console.log(NL + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})();
