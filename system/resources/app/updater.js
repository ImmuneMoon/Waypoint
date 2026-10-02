/* Waypoint self-update — shared by the Electron shell (main.js) and tools/dev-server.js.

   Releases live on a public GitHub repository. Each release is tagged with the version
   (e.g. "1.1.3" or "v1.1.3") and carries these assets:
     waypoint-app-<version>.zip          the system/app folder (the whole front end)
     waypoint-app-<version>.zip.sha256   hex digest of that zip (required)
     waypoint-app-<version>.zip.sig      the release's signature (required): Ed25519 over the three lines
                                         "<zip name>", "<sha256 hex>", "<version>", base64 (tools/release.js)
     manifest.json                       { "version": "1.1.3", "minShell": "1.1.2" }
     Waypoint_Setup.exe                  the full installer (for shell changes / fresh installs)
     Waypoint_Setup.exe.sig              the installer's signature: the same three lines, its name the first

   Hot update = check the signature, download the zip, check its digest, unpack into
   system/app.new, swap it in. The Electron shell keeps serving from disk, so a page reload
   picks up the new build. When a release needs a newer shell (manifest.minShell > our
   version) the shell fetches the installer itself (downloadInstaller: to a file, never into
   memory), checks it against the same key, and starts it silently over this copy
   (runInstaller) while Waypoint closes; the installer opens Waypoint again. Where that
   cannot be done (not an installed copy, no signed installer, a download that fails) the app
   walks the person through the installer in their browser, as before. No dependencies:
   plain https + zlib + crypto + a minimal ZIP reader.

   Who may update an install. The checksum only says the download arrived whole: whoever
   publishes a release writes it too. So a hot update is taken only when it is signed by the
   key whose public half this shell carries (updatekey.js, beside this file: a hot update
   replaces system/app and never the shell, so an update cannot bring its own key). The
   version is part of what is signed and must be the archive's own, so a signed older build
   cannot be offered again as a newer release. One step back is kept: the app as it was
   before the last hot update stays in system/app.prev, and rollbackAppUpdate puts it back. */
'use strict';
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const os = require('os');

const { UPDATE_PUBKEY } = require('./updatekey');

const UA = 'Waypoint-updater';
const SMALL = 4096;   // the most a checksum or a signature file may be: each is one short line
const UNSIGNED = 'unsigned update — refused';
const CANNOT_SELF = 'this copy cannot install an update by itself';
const SIG_OK = /^[A-Za-z0-9+/]{86}==$/;   // 64 bytes in base64: the only shape an Ed25519 signature has
const INSTALLER_NAME = 'Waypoint_Setup.exe';   // the name the installer's signature is over, whatever file it is kept in meanwhile
const INSTALLER_CAP = 600 * 1024 * 1024;   // the most an installer download may be (it is about 110 MB)
const TMP_PREFIX = 'waypoint-update-';   // the private folder a download is made in, under the temp directory
const VERSION_OK = /^[0-9A-Za-z][0-9A-Za-z.-]{0,39}$/;   // a version as a release tags it: no line break, no path, nothing to escape
function plainVersion(v) { return (typeof v === 'string' && VERSION_OK.test(v)) ? v : null; }

/* The words a release signs, and the check of a signature over them. Ed25519 only; anything that is not a 64-byte
   signature in base64, or a key that is not an Ed25519 public key in PEM, is simply not a signature: false, never a throw. */
function signedText(zipName, sha256hex, version) { return zipName + '\n' + sha256hex + '\n' + version + '\n'; }
function verifyUpdate(pubKeyPem, zipName, sha256hex, version, sigB64) {
    try {
        if (typeof pubKeyPem !== 'string' || !pubKeyPem.trim()) return false;
        if (typeof sigB64 !== 'string' || !SIG_OK.test(sigB64)) return false;
        const sig = Buffer.from(sigB64, 'base64');
        if (sig.length !== 64) return false;
        const key = crypto.createPublicKey(pubKeyPem);
        if (key.type !== 'public' || key.asymmetricKeyType !== 'ed25519') return false;
        return crypto.verify(null, Buffer.from(signedText(zipName, sha256hex, version), 'utf8'), key, sig) === true;
    } catch (e) { return false; }
}

function cmpVersion(a, b) {
    const pa = String(a || '0').replace(/^v/i, '').split('-')[0].split('.').map(n => parseInt(n, 10) || 0);
    const pb = String(b || '0').replace(/^v/i, '').split('-')[0].split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
    return 0;
}

// GET with redirects (GitHub asset downloads bounce through a CDN). Resolves a Buffer. max: the most bytes taken (200 MB unless a smaller cap is given).
function fetchBuffer(url, headers, redirects, max) {
    redirects = redirects == null ? 5 : redirects;
    const cap = (typeof max === 'number' && max > 0) ? max : 200 * 1024 * 1024;
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const mod = u.protocol === 'http:' ? http : https;
        const req = mod.get(u, { headers: Object.assign({ 'User-Agent': UA, 'Accept': '*/*' }, headers || {}) }, res => {
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0) {
                res.resume();
                return resolve(fetchBuffer(new URL(res.headers.location, url).href, headers, redirects - 1, max));
            }
            if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode + ' for ' + url)); }
            const chunks = []; let size = 0;
            res.on('data', c => { chunks.push(c); size += c.length; if (size > cap) { req.destroy(new Error('download too large')); } });
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        });
        req.on('error', reject);
        req.setTimeout(60000, () => req.destroy(new Error('timeout for ' + url)));
    });
}

/* GET with redirects straight to a file, for a download too large to hold in memory (the installer). The same rules as
   fetchBuffer: at most 5 redirects, an idle socket times out, only a 200 is taken. The cap is 600 MB unless a smaller one is
   given: a stated length past it is refused before a byte is read, and bytes that run past it stop the download. The file is
   made only once the answer is taken, must not exist yet, and is removed again on any failure.
   o: { max, redirects, onProgress(got, total|null) }. Resolves { sha256, size }: the digest of exactly what was written. */
function fetchToFile(url, file, o) {
    o = o || {};
    const redirects = o.redirects == null ? 5 : o.redirects;
    const cap = (typeof o.max === 'number' && o.max > 0) ? o.max : INSTALLER_CAP;
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const mod = u.protocol === 'http:' ? http : https;
        let done = false, out = null;
        const fail = (e) => {
            if (done) return; done = true;
            try { req.destroy(); } catch (_) {}
            const gone = () => { try { fs.unlinkSync(file); } catch (_) {} reject(e); };
            if (!out) reject(e);   // nothing was made: nothing to remove
            else if (out.closed) gone();
            else { out.once('close', gone); out.destroy(); }   // the file is removed once the system has let go of it
        };
        const req = mod.get(u, { headers: { 'User-Agent': UA, 'Accept': '*/*' } }, res => {
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0) {
                res.resume(); done = true;
                return resolve(fetchToFile(new URL(res.headers.location, url).href, file, Object.assign({}, o, { redirects: redirects - 1 })));
            }
            if (res.statusCode !== 200) { res.resume(); return fail(new Error('HTTP ' + res.statusCode + ' for ' + url)); }
            const stated = /^[0-9]{1,15}$/.test(String(res.headers['content-length'] || '')) ? parseInt(res.headers['content-length'], 10) : null;
            if (stated !== null && stated > cap) return fail(new Error('download too large'));   // before a byte of it is read
            const hash = crypto.createHash('sha256'); let size = 0;
            out = fs.createWriteStream(file, { flags: 'wx' });
            out.on('error', fail);
            res.on('data', c => {
                if (done) return;
                size += c.length;
                if (size > cap) return fail(new Error('download too large'));
                hash.update(c);
                if (!out.write(c)) { res.pause(); out.once('drain', () => res.resume()); }
                if (typeof o.onProgress === 'function') { try { o.onProgress(size, stated); } catch (_) {} }
            });
            res.on('end', () => {
                if (done) return;
                if (stated !== null && size !== stated) return fail(new Error('download cut short'));
                out.end(() => { if (done) return; done = true; resolve({ sha256: hash.digest('hex'), size: size }); });
            });
            res.on('error', fail);
            res.on('close', () => { if (!res.complete) fail(new Error('download cut short')); });
        });
        req.on('error', fail);
        req.setTimeout(60000, () => fail(new Error('timeout for ' + url)));
    });
}

/* Look up the latest release and decide what this install can do about it.
   opts: { repo: 'owner/name', currentVersion, shellVersion, apiUrl (override for tests),
           selfInstall (true only where this copy can run the installer over itself: the shell says so, never a request),
           pubKey (the shell's own unless a caller of this module passes another) } */
async function checkForUpdate(opts) {
    const apiUrl = opts.apiUrl || ('https://api.github.com/repos/' + opts.repo + '/releases/latest');
    const rel = JSON.parse((await fetchBuffer(apiUrl, { 'Accept': 'application/vnd.github+json' })).toString('utf8'));
    const latest = String(rel.tag_name || rel.name || '').replace(/^v/i, '');
    const assets = Array.isArray(rel.assets) ? rel.assets : [];
    const find = re => assets.find(a => re.test(a.name || ''));
    const zip = find(/^waypoint-app-.*\.zip$/i);
    const sha = find(/^waypoint-app-.*\.zip\.sha256$/i);
    const sig = find(/^waypoint-app-.*\.zip\.sig$/i);
    const manifestAsset = find(/^manifest\.json$/i);
    const installer = find(/^Waypoint_Setup\.exe$/i);
    const installerSig = find(/^Waypoint_Setup\.exe\.sig$/i);
    const pubKey = opts.pubKey !== undefined ? opts.pubKey : UPDATE_PUBKEY;
    const keyed = typeof pubKey === 'string' && !!pubKey.trim();
    let manifest = {};
    if (manifestAsset) { try { manifest = JSON.parse((await fetchBuffer(manifestAsset.browser_download_url)).toString('utf8')); } catch (e) { manifest = {}; } }
    const newer = latest && cmpVersion(latest, opts.currentVersion) > 0;
    const minShell = manifest.minShell || null;
    const shellOk = !minShell || cmpVersion(opts.shellVersion || opts.currentVersion, minShell) >= 0;
    const needsInstaller = !!(newer && (!zip || !shellOk));
    return {
        current: opts.currentVersion,
        latest: latest || null,
        newer: !!newer,
        notes: rel.body || '',
        page: rel.html_url || ('https://github.com/' + opts.repo + '/releases'),
        appZip: zip ? zip.browser_download_url : null,
        appZipName: zip ? String(zip.name) : null,   // the zip's own name as the release lists it: part of what is signed
        sha256: sha ? sha.browser_download_url : null,
        sig: sig ? sig.browser_download_url : null,
        installer: installer ? installer.browser_download_url : null,
        installerSig: installerSig ? installerSig.browser_download_url : null,
        installerSize: (installer && Number.isSafeInteger(installer.size) && installer.size > 0) ? installer.size : null,   // as the release lists it: for the words on the page only, never trusted as a bound
        minShell: minShell,
        canHotUpdate: !!(newer && zip && sha && sig && shellOk),   // never offered without its checksum and its signature (applyAppUpdate refuses it anyway)
        needsInstaller: needsInstaller,
        // this copy can fetch, check and run the installer by itself: the release must carry the installer AND its signature,
        // a key must be configured to check it with, and the shell itself must say this copy can run one
        canSelfInstall: !!(needsInstaller && installer && installerSig && keyed && opts.selfInstall === true),
    };
}

/* ---- minimal ZIP reader (store + deflate) ---- */
function readZip(buf) {
    // find End Of Central Directory
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) { if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; } }
    if (eocd < 0) throw new Error('not a zip file');
    const count = buf.readUInt16LE(eocd + 10);
    let off = buf.readUInt32LE(eocd + 16);
    const entries = [];
    for (let n = 0; n < count; n++) {
        if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('bad central directory');
        const method = buf.readUInt16LE(off + 10);
        const csize = buf.readUInt32LE(off + 20), usize = buf.readUInt32LE(off + 24);
        const nlen = buf.readUInt16LE(off + 28), xlen = buf.readUInt16LE(off + 30), clen = buf.readUInt16LE(off + 32);
        const lho = buf.readUInt32LE(off + 42);
        const name = buf.slice(off + 46, off + 46 + nlen).toString('utf8').split(String.fromCharCode(92)).join('/');   // Windows zippers write backslashes
        entries.push({ name, method, csize, usize, lho });
        off += 46 + nlen + xlen + clen;
    }
    return entries.map(e => ({
        name: e.name,
        isDir: e.name.endsWith('/'),
        data() {
            const lh = e.lho;
            if (buf.readUInt32LE(lh) !== 0x04034b50) throw new Error('bad local header for ' + e.name);
            const nlen = buf.readUInt16LE(lh + 26), xlen = buf.readUInt16LE(lh + 28);
            const start = lh + 30 + nlen + xlen;
            const raw = buf.slice(start, start + e.csize);
            if (e.method === 0) return raw;
            if (e.method === 8) return zlib.inflateRawSync(raw, { maxOutputLength: 256 * 1024 * 1024 });   // a bomb entry stops at the cap instead of the machine's memory
            throw new Error('unsupported compression for ' + e.name);
        },
    }));
}

function rmrf(p) { if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true }); }

/* Verify, download, unpack and swap. opts: { systemDir, appZip, appZipName, sha256 (url|null), sig (url|null), version, pubKey, shellVersion }
   pubKey defaults to the shell's own (updatekey.js); only this module's callers can pass another (the tests do), never a request.
   Returns { ok, version, previous } — the previous app folder is kept as app.prev for one rollback. */
async function applyAppUpdate(opts) {
    const systemDir = opts.systemDir;
    const appDir = path.join(systemDir, 'app');
    const newDir = path.join(systemDir, 'app.new');
    const prevDir = path.join(systemDir, 'app.prev');
    const pubKey = opts.pubKey !== undefined ? opts.pubKey : UPDATE_PUBKEY;
    // a hot update replaces the app: never without the release's signature, checked with the key this shell carries
    if (typeof pubKey !== 'string' || !pubKey.trim()) throw new Error(UNSIGNED);   // no key configured: nothing can be vouched for
    if (!opts.sig) throw new Error(UNSIGNED);
    if (!opts.sha256) throw new Error('no checksum published for this update — refused');   // never without its digest (every release ships one)
    const version = plainVersion(opts.version);
    if (!version || opts.appZipName !== 'waypoint-app-' + version + '.zip') throw new Error(UNSIGNED);   // the signed words name the zip and the version: both must be the release's own
    const want = (await fetchBuffer(opts.sha256, null, null, SMALL)).toString('utf8').trim().split(/\s+/)[0].toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(want)) throw new Error('unreadable checksum — update aborted');   // an empty or odd .sha256 is a failure, not a pass
    const sigText = (await fetchBuffer(opts.sig, null, null, SMALL)).toString('utf8').trim();
    if (!verifyUpdate(pubKey, opts.appZipName, want, version, sigText)) throw new Error(UNSIGNED);
    // the signature covers the digest; the digest covers every byte of the zip
    const zipBuf = await fetchBuffer(opts.appZip);
    const got = crypto.createHash('sha256').update(zipBuf).digest('hex');
    if (want !== got) throw new Error('checksum mismatch — update aborted');
    const entries = readZip(zipBuf);
    if (!entries.length) throw new Error('empty update archive');
    // the zip may hold "app/..." or the files at its root — strip one common leading folder
    let prefix = '';
    const first = entries[0].name.split('/')[0];
    if (entries.every(e => e.name.startsWith(first + '/'))) prefix = first + '/';
    if (!entries.some(e => e.name === prefix + 'index.html')) throw new Error('archive does not contain the app (no index.html)');
    try {
        rmrf(newDir); fs.mkdirSync(newDir, { recursive: true });
        for (const e of entries) {
            const rel = e.name.slice(prefix.length);
            if (!rel || rel.split('/').includes('..') || path.isAbsolute(rel)) continue;
            const dest = path.join(newDir, rel);
            if (!dest.startsWith(newDir)) continue;
            if (e.isDir) { fs.mkdirSync(dest, { recursive: true }); continue; }
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.writeFileSync(dest, e.data());
        }
        // the archive must be the version the release (and its signature) names: a mislabelled build never becomes the app
        let inside = null, needs;
        try { const vj = JSON.parse(fs.readFileSync(path.join(newDir, 'version.json'), 'utf8')); inside = vj.version; needs = vj.minShell; } catch (e) { inside = null; }
        if (inside !== version) throw new Error('the archive is not version ' + version + ' — update aborted');
        // the signed archive says itself which core it needs (the manifest beside it is not signed): app files never land on a core older than that
        if (needs !== undefined && needs !== null && (!plainVersion(needs) || !plainVersion(opts.shellVersion) || cmpVersion(opts.shellVersion, needs) < 0)) throw new Error('this update needs a newer core than this copy has — it comes as the installer');
        // swap: app -> app.prev (replacing any older rollback copy), app.new -> app
        rmrf(prevDir);
        fs.renameSync(appDir, prevDir);
        try { fs.renameSync(newDir, appDir); }
        catch (e) { fs.renameSync(prevDir, appDir); throw e; }   // put the old app back if the swap fails
    } catch (e) {
        try { rmrf(newDir); } catch (_) {}   // nothing half-unpacked is left behind
        throw e;
    }
    return { ok: true, version: version, previous: prevDir };
}

/* The way back. What the shell kept of the app as it was before the last hot update (system/app.prev), and whether it may
   be put back: it must be an app (an index.html), of a plain version that is not older than this shell — the shell and the
   app it was installed with share a version, so an older copy is one left from before the installer ran, and the version
   this install reports is the newer of the two (an older app would be reported, and updated, as the shell's version). */
function prevInfo(systemDir, shellVersion) {
    const prevDir = path.join(systemDir, 'app.prev');
    let prevVersion = null, isApp = false;
    try { isApp = fs.statSync(path.join(prevDir, 'index.html')).isFile(); } catch (e) { isApp = false; }
    try { prevVersion = plainVersion(JSON.parse(fs.readFileSync(path.join(prevDir, 'version.json'), 'utf8')).version); } catch (e) { prevVersion = null; }
    const hasPrev = !!(isApp && prevVersion && (!shellVersion || cmpVersion(prevVersion, shellVersion) >= 0));
    return { hasPrev: hasPrev, prevVersion: prevVersion };
}
/* Put the previous app back. opts: { systemDir, shellVersion }. The saves folder is never touched; the app that is replaced
   is removed (the newer release stays on offer, so it can be taken again). Returns { ok, version }. */
function rollbackAppUpdate(opts) {
    const systemDir = opts.systemDir;
    const appDir = path.join(systemDir, 'app');
    const prevDir = path.join(systemDir, 'app.prev');
    const badDir = path.join(systemDir, 'app.bad');
    const p = prevInfo(systemDir, opts.shellVersion);
    if (!p.hasPrev) throw new Error('no previous version to restore');
    rmrf(badDir);
    fs.renameSync(appDir, badDir);
    try { fs.renameSync(prevDir, appDir); }
    catch (e) { fs.renameSync(badDir, appDir); throw e; }   // put the current app back if the swap fails
    try { rmrf(badDir); } catch (e) { /* a leftover is cleared by the next restore */ }
    return { ok: true, version: p.prevVersion };
}

/* ---- an update that changes the core: the shell fetches the installer, checks it, and runs it over this copy ---- */

/* Download the installer to a file and check it. opts: { url, sigUrl, version, pubKey, dir, onProgress, onVerify, maxBytes }.
   The signed words are the same three lines as the zip's, with the installer's own name the first: a zip's signature never
   stands for an installer, nor the reverse. The bytes go to <dir>/Waypoint_Setup-<version>.exe.part and take their final
   name only once the signature checks; anything else removes them. dir is a fresh private folder the caller made.
   Returns { file, sha256, version }. */
async function downloadInstaller(opts) {
    const pubKey = opts.pubKey !== undefined ? opts.pubKey : UPDATE_PUBKEY;
    if (typeof pubKey !== 'string' || !pubKey.trim()) throw new Error(UNSIGNED);   // no key configured: nothing can be vouched for
    const version = plainVersion(opts.version);
    if (!version || !opts.url || !opts.sigUrl) throw new Error(UNSIGNED);
    if (typeof opts.dir !== 'string' || !path.isAbsolute(opts.dir) || !fs.statSync(opts.dir).isDirectory()) throw new Error('no folder to download into');
    const file = path.join(opts.dir, 'Waypoint_Setup-' + version + '.exe'), part = file + '.part';
    // the signature first: a release without one that could be a signature costs no download
    const sigText = (await fetchBuffer(opts.sigUrl, null, null, SMALL)).toString('utf8').trim();
    if (!SIG_OK.test(sigText)) throw new Error(UNSIGNED);
    try {
        const got = await fetchToFile(opts.url, part, { max: opts.maxBytes, onProgress: opts.onProgress });
        if (typeof opts.onVerify === 'function') { try { opts.onVerify(); } catch (_) {} }
        if (!verifyUpdate(pubKey, INSTALLER_NAME, got.sha256, version, sigText)) throw new Error(UNSIGNED);
        fs.renameSync(part, file);
        return { file: file, sha256: got.sha256, version: version };
    } catch (e) {
        try { fs.unlinkSync(part); } catch (_) {}
        try { fs.unlinkSync(file); } catch (_) {}
        throw e;
    }
}

function hashFile(file) {
    return new Promise((resolve, reject) => {
        const h = crypto.createHash('sha256'), s = fs.createReadStream(file);
        s.on('error', reject); s.on('data', c => h.update(c)); s.on('end', () => resolve(h.digest('hex')));
    });
}

/* Start the installer over this copy. opts: { file, sha256, appRoot, spawn }.
   The file sat on disk since it was checked, so it is hashed again and must still be the digest that was verified.
   It is started detached with no shell and no pipes, with exactly these arguments: a silent update in place of the copy
   that is running (/DIR: whatever the registry remembers of another copy). The folder goes in as ONE argument,
   '/DIR=' + path, with no quotes of our own: where it holds a space Node wraps the whole argument in double quotes, and
   Setup's own reader drops quotes wherever they stand, so it reads the same path; a path ending in a backslash or holding
   a double quote would not survive that, so the path is resolved first and a quote is refused.
   spawn is the caller's (the suite passes its own, so no process is ever started there). Returns { ok: true }. */
const INSTALLER_ARGS = ['/SILENT', '/UPDATE=1', '/SUPPRESSMSGBOXES', '/NORESTART'];
async function runInstaller(opts) {
    if (typeof opts.file !== 'string' || !path.isAbsolute(opts.file)) throw new Error('no installer to run');
    if (typeof opts.appRoot !== 'string' || !path.isAbsolute(opts.appRoot) || opts.appRoot.indexOf('"') >= 0) throw new Error(CANNOT_SELF);
    const appRoot = path.resolve(opts.appRoot);
    let isApp = false; try { isApp = fs.statSync(path.join(appRoot, 'system')).isDirectory(); } catch (e) { isApp = false; }
    if (!isApp) throw new Error(CANNOT_SELF);   // not a copy of Waypoint: nothing is installed anywhere else
    let now = null; try { now = await hashFile(opts.file); } catch (e) { now = null; }
    if (typeof opts.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(opts.sha256) || now !== opts.sha256) throw new Error('the installer changed after it was checked — not run');
    const spawn = opts.spawn || require('child_process').spawn;
    const child = spawn(opts.file, INSTALLER_ARGS.concat(['/DIR=' + appRoot]), { detached: true, stdio: 'ignore', shell: false });
    if (!child || typeof child.pid !== 'number') {   // it did not start: the reason arrives as an 'error' event
        const why = await new Promise(resolve => {
            if (!child || typeof child.once !== 'function') return resolve(null);
            const t = setTimeout(() => resolve(null), 2000);
            child.once('error', e => { clearTimeout(t); resolve(e); });
        });
        throw new Error('the installer could not be started' + (why && typeof why.code === 'string' ? ' (' + why.code + ')' : ''));
    }
    if (typeof child.on === 'function') child.on('error', () => {});   // it runs on its own from here
    if (typeof child.unref === 'function') child.unref();
    return { ok: true };
}

/* Folders an earlier download left in the temp directory (waypoint-update-*), older than a day: removed when a new one starts. */
function sweepInstallerDirs(base, now, maxAgeMs) {
    const age = typeof maxAgeMs === 'number' ? maxAgeMs : 24 * 60 * 60 * 1000;
    let names = []; try { names = fs.readdirSync(base); } catch (e) { return 0; }
    let n = 0;
    for (const name of names) {
        if (name.indexOf(TMP_PREFIX) !== 0) continue;
        const p = path.join(base, name);
        try { const st = fs.lstatSync(p); if (st.isDirectory() && (now || Date.now()) - st.mtimeMs > age) { fs.rmSync(p, { recursive: true, force: true }); n++; } } catch (e) { /* in use, or gone: the next sweep's */ }
    }
    return n;
}

/* The mark an install that was started leaves beside the shell's own data (never in the saves folder): { version, at }.
   While the shell is still older than that version the install did not finish, and the check says so (installFailed);
   once the shell is that version, or the mark is not one, it is removed. */
const MARK = 'update-install.json';
function installFailed(cfg) {
    if (typeof cfg.dataDir !== 'string' || !cfg.dataDir) return null;
    const file = path.join(cfg.dataDir, MARK);
    let v = null, there = true;
    try { v = plainVersion(JSON.parse(fs.readFileSync(file, 'utf8')).version); } catch (e) { v = null; try { fs.lstatSync(file); } catch (_) { there = false; } }
    if (!there) return null;
    if (v && cmpVersion(cfg.shellVersion, v) < 0) return v;
    try { fs.unlinkSync(file); } catch (e) {}
    return null;
}

/* The paths the handler below answers: both servers send exactly these to it. */
const UPDATE_ROUTES = ['/api/update-check', '/api/update-apply', '/api/update-rollback', '/api/update-installer', '/api/update-installer-status', '/api/update-installer-run', '/api/update-installer-dismiss'];

/* Wire the endpoints onto any (req, res, url) dispatcher.
   cfg: { repo, currentVersion, shellVersion, systemDir, apiUrl, and for an update that changes the core:
          selfInstall (true only where this copy can run the installer over itself), appRoot (the folder that holds
          Waypoint.exe and system/), dataDir (the shell's own data folder), quit (closes the app) }.
   Nothing a request carries chooses what is applied, which key vouches for it, what is downloaded, where to, or what is
   run: the routes read no body. (pubKey, spawn, tmpDir and maxInstallerBytes are for the suite, which runs this handler
   with a key pair, a process starter and a temp folder of its own; neither server passes them.) */
function makeHandler(cfg) {
    let cache = null, cacheAt = 0;
    // the one installer download this shell is busy with: numbers and plain short words only ever leave it
    let inst = { state: 'idle', got: 0, total: null, version: null, error: null };
    let starting = false, running = false, swept = false;
    const instStatus = () => ({ state: inst.state, got: inst.got, total: inst.total, version: inst.version, error: inst.error });
    const short = e => String(e && e.message || e).slice(0, 200);
    const json = (res, code, body, then) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body), then); };
    return async function handle(req, res, url) {
        if (url.pathname === '/api/update-check' && req.method === 'GET') {
            // once a run, on a copy that can install a core update: what an earlier one left in the temp folder more than a day ago (the installer it ran from) is cleared away
            if (!swept && cfg.selfInstall === true) { swept = true; try { sweepInstallerDirs(cfg.tmpDir || os.tmpdir(), Date.now()); } catch (e) { /* the next run's */ } }
            try {
                const force = url.searchParams.get('force') === '1';
                if (!cache || force || Date.now() - cacheAt > 15 * 60 * 1000) { cache = await checkForUpdate(cfg); cacheAt = Date.now(); }
                res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
                res.end(JSON.stringify(Object.assign({ repo: cfg.repo }, cache, prevInfo(cfg.systemDir, cfg.shellVersion), { installFailed: installFailed(cfg) })));
            } catch (e) {
                res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
                res.end(JSON.stringify(Object.assign({ repo: cfg.repo, current: cfg.currentVersion, error: String(e.message || e) }, prevInfo(cfg.systemDir, cfg.shellVersion), { installFailed: installFailed(cfg) })));   // the way back needs no network
            }
            return true;
        }
        if (url.pathname === '/api/update-apply' && req.method === 'POST') {
            try {
                const info = await checkForUpdate(cfg);
                if (!info.canHotUpdate) throw new Error(info.needsInstaller ? 'this update needs the installer' : 'already up to date');
                const r = await applyAppUpdate({ systemDir: cfg.systemDir, appZip: info.appZip, appZipName: info.appZipName, sha256: info.sha256, sig: info.sig, version: info.latest, pubKey: cfg.pubKey, shellVersion: cfg.shellVersion });
                cache = null;
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(r));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
            }
            return true;
        }
        if (url.pathname === '/api/update-rollback' && req.method === 'POST') {
            try {
                const r = rollbackAppUpdate({ systemDir: cfg.systemDir, shellVersion: cfg.shellVersion });
                cache = null;   // the version this install reports just changed: the next check compares afresh (the newer release is offered again, never applied by itself)
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(r));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
            }
            return true;
        }
        // Start fetching the installer of the release a check reports NOW. One at a time: while one is under way, or done
        // and waiting to be run, a second call only hears how that one stands.
        if (url.pathname === '/api/update-installer' && req.method === 'POST') {
            if (starting || running || inst.state === 'downloading' || inst.state === 'verifying' || inst.state === 'ready') { json(res, 200, Object.assign({ ok: true }, instStatus())); return true; }
            starting = true;
            let info = null;
            try {
                info = await checkForUpdate(cfg);
                if (!info.canSelfInstall) throw new Error(info.needsInstaller ? CANNOT_SELF : 'there is no update that needs the installer');
                if (!plainVersion(info.latest)) throw new Error(UNSIGNED);
            } catch (e) { starting = false; json(res, 409, { ok: false, error: short(e) }); return true; }
            const job = inst = { state: 'downloading', got: 0, total: info.installerSize, version: info.latest, error: null, file: null, sha256: null, dir: null };
            starting = false;
            json(res, 200, Object.assign({ ok: true }, instStatus()));   // answered at once: the page asks how it stands
            (async () => {
                try {
                    const base = cfg.tmpDir || os.tmpdir();
                    sweepInstallerDirs(base, Date.now());
                    job.dir = fs.mkdtempSync(path.join(base, TMP_PREFIX));
                    const r = await downloadInstaller({ url: info.installer, sigUrl: info.installerSig, version: info.latest, pubKey: cfg.pubKey, dir: job.dir, maxBytes: cfg.maxInstallerBytes,
                        onProgress: (got, total) => { job.got = got; if (total !== null) job.total = total; }, onVerify: () => { job.state = 'verifying'; } });
                    job.file = r.file; job.sha256 = r.sha256; job.state = 'ready';
                } catch (e) {
                    job.state = 'failed'; job.error = short(e);
                    if (job.dir) { try { fs.rmSync(job.dir, { recursive: true, force: true }); } catch (_) {} }   // a failed download leaves nothing behind
                }
            })();
            return true;
        }
        if (url.pathname === '/api/update-installer-status' && req.method === 'GET') { json(res, 200, instStatus()); return true; }
        // Run what was fetched and checked. Only once it is ready; the app is asked to close only after the answer has gone out.
        if (url.pathname === '/api/update-installer-run' && req.method === 'POST') {
            if (inst.state !== 'ready' || running) { json(res, 409, { ok: false, error: 'no update is ready to install' }); return true; }
            running = true;
            const job = inst, mark = (typeof cfg.dataDir === 'string' && cfg.dataDir) ? path.join(cfg.dataDir, MARK) : null;
            try {
                if (mark) { try { fs.mkdirSync(cfg.dataDir, { recursive: true }); fs.writeFileSync(mark, JSON.stringify({ version: job.version, at: Date.now() })); } catch (_) { /* the update is not held up for its mark */ } }
                await runInstaller({ file: job.file, sha256: job.sha256, appRoot: cfg.appRoot, spawn: cfg.spawn });
            } catch (e) {
                if (mark) { try { fs.unlinkSync(mark); } catch (_) {} }   // nothing was started: nothing failed to finish
                job.state = 'failed'; job.error = short(e); running = false;
                if (job.dir) { try { fs.rmSync(job.dir, { recursive: true, force: true }); } catch (_) {} }
                json(res, 500, { ok: false, error: job.error });
                return true;
            }
            inst = { state: 'idle', got: 0, total: null, version: null, error: null }; running = false; cache = null;   // the file stays where it is: the installer is running from it (a later download sweeps it away)
            json(res, 200, { ok: true, version: job.version }, () => { if (typeof cfg.quit === 'function') { try { cfg.quit(); } catch (_) {} } });
            return true;
        }
        if (url.pathname === '/api/update-installer-dismiss' && req.method === 'POST') {
            if (typeof cfg.dataDir === 'string' && cfg.dataDir) { try { fs.unlinkSync(path.join(cfg.dataDir, MARK)); } catch (_) {} }
            json(res, 200, { ok: true });
            return true;
        }
        return false;
    };
}

module.exports = { cmpVersion, checkForUpdate, applyAppUpdate, rollbackAppUpdate, prevInfo, signedText, verifyUpdate, readZip, makeHandler, fetchBuffer,
    fetchToFile, downloadInstaller, runInstaller, sweepInstallerDirs, installFailed, UPDATE_ROUTES, INSTALLER_NAME, INSTALLER_ARGS };
