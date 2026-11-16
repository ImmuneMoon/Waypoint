/* Waypoint self-update — shared by the Electron shell (main.js) and tools/dev-server.js.

   Where an update comes from (1.6.4; the owner, 2026-11-16: "Private, updates from waypointvtt.com"). The shell asks
   Waypoint's own website for the newest release and fetches its files from Waypoint's own download host, and from no
   other address: https://waypointvtt.com/api/updates/... answers the signed list, and
   https://downloads.waypointvtt.com/waypoint/<version>/... holds the files (updateHosts, updateUrlOk). A redirect that
   would leave those two is refused. The list is an envelope, { "manifest": "<the manifest as a JSON string>", "sig":
   "<base64>" }: the signature is Ed25519, with the same key as the files, over "waypoint-manifest\n" and the manifest's
   own text, and it is checked BEFORE a word of the manifest is read (readEnvelope). The words before the manifest are
   the list's own, so a list's signature never stands for a file's. The manifest (cleanManifest) says:
     version, minShell, electron        the release, the core it needs, the Electron it was built with
     notes, notesUrl                    plain text shown as it is (cut at 20,000 characters), and the page of notes
     files: [{ name, url, size, sha256, sig }]   each file by its exact name:
       waypoint-app-<version>.zip       the system/app folder (the whole front end)
       Waypoint_Setup.exe               the full installer (for shell changes / fresh installs)
     with sha256 the hex digest the downloaded bytes must match, and sig the file's own signature as before: Ed25519
     over the three lines "<file name>", "<sha256 hex>", "<version>", base64 (tools/release.js, its site half in
     tools/sitepub.js, which reads every list it writes back through this very code before it is uploaded). Any key the
     app does not know is passed over, and so is a file entry that names no file. A field that decides what is fetched
     or whether it is taken (version, minShell, the zip's and the installer's address, size, digest and signature) that
     does not clean offers no update at all, said plainly; a field that is only shown (notes, notesUrl, electron) that
     does not clean is dropped, so a slip in words never stops every install updating. Until 1.6.3 the list was a
     public GitHub release, with the digest and the signature in files of their own.

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
const UNSIGNED = 'unsigned update — refused';
const CANNOT_SELF = 'this copy cannot install an update by itself';
const SIG_OK = /^[A-Za-z0-9+/]{86}==$/;   // 64 bytes in base64: the only shape an Ed25519 signature has
const INSTALLER_NAME = 'Waypoint_Setup.exe';   // the name the installer's signature is over, whatever file it is kept in meanwhile
const INSTALLER_CAP = 600 * 1024 * 1024;   // the most an installer download may be (it is about 110 MB)
const TMP_PREFIX = 'waypoint-update-';   // the private folder a download is made in, under the temp directory
const VERSION_OK = /^[0-9A-Za-z][0-9A-Za-z.-]{0,39}$/;   // a version as a release tags it: no line break, no path, nothing to escape
function plainVersion(v) { return (typeof v === 'string' && VERSION_OK.test(v)) ? v : null; }

/* Where updates come from (1.6.4). UPDATE_SITE is the shell's own default; main.js names the same address as its one
   constant and hands it in as cfg.site. The list is read from <site>/api/updates/latest, and the files from the download
   host beside it, downloads.<site's host>, under /waypoint/<version>/. */
const UPDATE_SITE = 'https://waypointvtt.com';
const ENVELOPE_CAP = 1024 * 1024;   // the most the list may be: a manifest of a few files and its notes
const NOTES_MAX = 20000;            // the most characters of notes shown; longer notes are cut, never refused
const FILES_MAX = 64;               // the most entries of the manifest's file list that are looked at
const MANIFEST_PREFIX = 'waypoint-manifest\n';   // the words the list's signature begins with: never the start of a file's signed words
const LIST_UNSIGNED = 'the update list is not signed by Waypoint — no update offered';
const LIST_BAD = 'the update list could not be read — no update offered';
const NOT_OURS = "that address is not Waypoint's update site — refused";
const NOT_LISTED = 'the download is not the file the update list names — refused';   // its length or its digest is not the list's

/* The two addresses this shell may fetch from, as origins: { site, siteHost, api, files, apiUrl }. By default they are
   the site and its download host. opts.apiUrl (the list's own address) and opts.filesUrl (an address on the files' host)
   stand in for them: they are for the suite and the dev server's dry run against a mock on this machine, and come only
   from a caller of this module (the shell names neither), never from a request. An override that is no http(s) address
   gives an origin of null, which nothing matches, so a broken override fetches nothing rather than anything. */
function originOf(s) {
    try { const u = new URL(String(s)); return (u.protocol === 'https:' || u.protocol === 'http:') ? u.origin : null; } catch (e) { return null; }
}
function updateHosts(opts) {
    opts = opts || {};
    const site = originOf(opts.site) || UPDATE_SITE;
    const siteHost = new URL(site).hostname;
    const given = v => v !== undefined && v !== null;
    const api = given(opts.apiUrl) ? originOf(opts.apiUrl) : site;
    const files = given(opts.filesUrl) ? originOf(opts.filesUrl) : 'https://downloads.' + siteHost;
    return { site: site, siteHost: siteHost, api: api, files: files, apiUrl: given(opts.apiUrl) ? String(opts.apiUrl) : site + '/api/updates/latest' };
}
/* May the shell fetch this address? Only the list's path on the site (/api/updates/...) and the files' path on the
   download host (/waypoint/...), with no user name, no password, no query and no fragment. The path is judged after the
   URL parser has resolved it, so a dot-dot never climbs out. Asked of the first address and of every redirect. */
function updateUrlOk(u, h) {
    if (!h) return false;
    if (!(u instanceof URL)) { try { u = new URL(String(u)); } catch (e) { return false; } }
    if (u.username || u.password || u.search || u.hash) return false;
    if (h.api && u.origin === h.api && u.pathname.indexOf('/api/updates/') === 0) return true;
    if (h.files && u.origin === h.files && u.pathname.indexOf('/waypoint/') === 0) return true;
    return false;
}
/* May a release's notes page be this address? A page of the site itself over https, with no port, user name, password or
   query, and never under /api/ (in any letter case): the same rule shellguard.releaseLink holds a page of the site to, so the
   page a check names is always one the walk-through may open. A fragment is a place on the page and is kept. Answers the
   address as the URL parser made it, or null. */
function sitePage(s, h) {
    let u = null; try { u = typeof s === 'string' && s.length <= 2000 ? new URL(s) : null; } catch (e) { u = null; }
    if (!u || u.protocol !== 'https:' || u.hostname !== h.siteHost || u.port || u.username || u.password || u.search) return null;
    if (/^\/api(\/|$)/i.test(u.pathname)) return null;
    return u.href;
}

/* The words a release signs, and the check of a signature over them. Ed25519 only; anything that is not a 64-byte
   signature in base64, or a key that is not an Ed25519 public key in PEM, is simply not a signature: false, never a throw. */
function signedText(zipName, sha256hex, version) { return zipName + '\n' + sha256hex + '\n' + version + '\n'; }
// An Ed25519 signature over these bytes by this key? The one check both a file's and the list's signature go through.
function verifyBytes(pubKeyPem, bytes, sigB64) {
    try {
        if (typeof pubKeyPem !== 'string' || !pubKeyPem.trim()) return false;
        if (typeof sigB64 !== 'string' || !SIG_OK.test(sigB64)) return false;
        const sig = Buffer.from(sigB64, 'base64');
        if (sig.length !== 64) return false;
        const key = crypto.createPublicKey(pubKeyPem);
        if (key.type !== 'public' || key.asymmetricKeyType !== 'ed25519') return false;
        return crypto.verify(null, bytes, key, sig) === true;
    } catch (e) { return false; }
}
function verifyUpdate(pubKeyPem, zipName, sha256hex, version, sigB64) {
    return verifyBytes(pubKeyPem, Buffer.from(signedText(zipName, sha256hex, version), 'utf8'), sigB64);
}
// The list's signature: over "waypoint-manifest\n" and the manifest's own text, as UTF-8 (the site passes it on exactly as signed).
function verifyManifest(pubKeyPem, manifestText, sigB64) {
    if (typeof manifestText !== 'string') return false;
    return verifyBytes(pubKeyPem, Buffer.from(MANIFEST_PREFIX + manifestText, 'utf8'), sigB64);
}

function cmpVersion(a, b) {
    const pa = String(a || '0').replace(/^v/i, '').split('-')[0].split('.').map(n => parseInt(n, 10) || 0);
    const pb = String(b || '0').replace(/^v/i, '').split('-')[0].split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
    return 0;
}

/* GET with redirects. Resolves a Buffer. max: the most bytes taken (200 MB unless a smaller cap is given).
   ok (a function of a URL): where it is given, the first address and every redirect must pass it, or nothing is fetched
   and the answer is a refusal (NOT_OURS). Every fetch of an update passes updateUrlOk with the update hosts. */
function fetchBuffer(url, headers, redirects, max, ok) {
    redirects = redirects == null ? 5 : redirects;
    const cap = (typeof max === 'number' && max > 0) ? max : 200 * 1024 * 1024;
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        if (typeof ok === 'function' && !ok(u)) return reject(new Error(NOT_OURS));
        const mod = u.protocol === 'http:' ? http : https;
        const req = mod.get(u, { headers: Object.assign({ 'User-Agent': UA, 'Accept': '*/*' }, headers || {}) }, res => {
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0) {
                res.resume();
                let next; try { next = new URL(res.headers.location, url); } catch (e) { return reject(new Error('a redirect to no address for ' + url)); }
                if (typeof ok === 'function' && !ok(next)) return reject(new Error(NOT_OURS));   // a redirect never leaves the update hosts
                return resolve(fetchBuffer(next.href, headers, redirects - 1, max, ok));
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
   o: { max, redirects, onProgress(got, total|null), ok, exact }. ok, where given, judges the first address and every redirect
   as fetchBuffer's does: one that fails it makes no file. exact, where given, is the one length the file may have (the
   installer's size as the signed list gives it): a stated length that is another is refused before a byte is read and before
   any file is made, bytes that run past it stop the download, and an end short of it fails, each as NOT_LISTED.
   Resolves { sha256, size }: the digest of exactly what was written. */
function fetchToFile(url, file, o) {
    o = o || {};
    const redirects = o.redirects == null ? 5 : o.redirects;
    const cap = (typeof o.max === 'number' && o.max > 0) ? o.max : INSTALLER_CAP;
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        if (typeof o.ok === 'function' && !o.ok(u)) return reject(new Error(NOT_OURS));
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
                let next; try { next = new URL(res.headers.location, url); } catch (e) { return reject(new Error('a redirect to no address for ' + url)); }
                if (typeof o.ok === 'function' && !o.ok(next)) return reject(new Error(NOT_OURS));   // a redirect never leaves the update hosts: nothing was made
                return resolve(fetchToFile(next.href, file, Object.assign({}, o, { redirects: redirects - 1 })));
            }
            if (res.statusCode !== 200) { res.resume(); return fail(new Error('HTTP ' + res.statusCode + ' for ' + url)); }
            const stated = /^[0-9]{1,15}$/.test(String(res.headers['content-length'] || '')) ? parseInt(res.headers['content-length'], 10) : null;
            const exact = (typeof o.exact === 'number') ? o.exact : null;
            if (exact !== null && stated !== null && stated !== exact) return fail(new Error(NOT_LISTED));   // not the length the list names: before a byte of it is read
            if (stated !== null && stated > cap) return fail(new Error('download too large'));   // before a byte of it is read
            const hash = crypto.createHash('sha256'); let size = 0;
            out = fs.createWriteStream(file, { flags: 'wx' });
            out.on('error', fail);
            res.on('data', c => {
                if (done) return;
                size += c.length;
                if (exact !== null && size > exact) return fail(new Error(NOT_LISTED));
                if (size > cap) return fail(new Error('download too large'));
                hash.update(c);
                if (!out.write(c)) { res.pause(); out.once('drain', () => res.resume()); }
                if (typeof o.onProgress === 'function') { try { o.onProgress(size, stated); } catch (_) {} }
            });
            res.on('end', () => {
                if (done) return;
                if (stated !== null && size !== stated) return fail(new Error('download cut short'));
                if (exact !== null && size !== exact) return fail(new Error(NOT_LISTED));
                out.end(() => { if (done) return; done = true; resolve({ sha256: hash.digest('hex'), size: size }); });
            });
            res.on('error', fail);
            res.on('close', () => { if (!res.complete) fail(new Error('download cut short')); });
        });
        req.on('error', fail);
        req.setTimeout(60000, () => fail(new Error('timeout for ' + url)));
    });
}

/* The list as it arrived, judged: its signature first, then its text. buf is the envelope's bytes. Answers the manifest
   as a plain object, or throws LIST_UNSIGNED (no manifest text or no signature, or a signature that does not check against
   the key) or LIST_BAD (an envelope or a manifest that is no JSON object). Nothing of the manifest is parsed before its
   signature has checked. */
function readEnvelope(buf, pubKey) {
    let env = null;
    try { env = JSON.parse(Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf)); } catch (e) { throw new Error(LIST_BAD); }
    if (!env || typeof env !== 'object' || Array.isArray(env)) throw new Error(LIST_BAD);
    if (typeof env.manifest !== 'string' || typeof env.sig !== 'string') throw new Error(LIST_UNSIGNED);
    if (!verifyManifest(pubKey, env.manifest, env.sig.trim())) throw new Error(LIST_UNSIGNED);
    let m = null;
    try { m = JSON.parse(env.manifest); } catch (e) { throw new Error(LIST_BAD); }
    if (!m || typeof m !== 'object' || Array.isArray(m)) throw new Error(LIST_BAD);
    return m;
}
/* Cut a text to n characters (whole code points: half a character is never left at the cut). */
function cutChars(s, n) { if (s.length <= n) return s; return Array.from(s).slice(0, n).join(''); }
/* One file of the manifest, cleaned: { name, url, size, sha256, sig }, or a throw of LIST_BAD. Its address must be on the
   download host, under /waypoint/<version>/, and end in the file's own name; its size a whole number above 0; its digest
   64 hex digits (read in lower case, the signed words' own); its signature the base64 of 64 bytes. */
function cleanFile(f, name, version, h) {
    if (typeof f.url !== 'string' || f.url.length > 2000) throw new Error(LIST_BAD);
    let u; try { u = new URL(f.url); } catch (e) { throw new Error(LIST_BAD); }
    if (!updateUrlOk(u, h) || u.origin !== h.files || u.pathname.indexOf('/waypoint/' + version + '/') !== 0) throw new Error(LIST_BAD);
    let last = null; try { last = decodeURIComponent(u.pathname.slice(u.pathname.lastIndexOf('/') + 1)); } catch (e) { last = null; }
    if (last !== name) throw new Error(LIST_BAD);
    if (!Number.isSafeInteger(f.size) || f.size <= 0) throw new Error(LIST_BAD);
    if (typeof f.sha256 !== 'string' || !/^[0-9a-fA-F]{64}$/.test(f.sha256)) throw new Error(LIST_BAD);
    const sig = typeof f.sig === 'string' ? f.sig.trim() : null;
    if (!sig || !SIG_OK.test(sig)) throw new Error(LIST_BAD);
    return { name: name, url: u.href, size: f.size, sha256: f.sha256.toLowerCase(), sig: sig };
}
/* The manifest a signature vouched for, read field by field. A field that decides what is fetched or whether it is
   taken must clean, or no update is offered at all (a throw of LIST_BAD): version, minShell (a plain version, the second
   where given), the files list, and of it the two the app looks for by their exact names, the zip of this version and the
   installer (each once, each through cleanFile). A field that is only shown is dropped where it does not clean, and the
   update stands: electron (a plain version, else none), notes (text, cut at NOTES_MAX, else none) and notesUrl (a page of
   the site, sitePage, else none: the site's own front page stands in). An entry of the files list that is no object with
   a name is passed over, as a file of another name is, and so are keys the app does not know, so the site can add to the
   list later. published is the site's to show, never read here. The release build reads every list it writes back
   through this function and holds it to what it wrote (tools/sitepub.js envelopeCheck), so a writer that drifts from
   it is stopped at the build and never reaches an install. */
function cleanManifest(m, h) {
    const bad = () => { throw new Error(LIST_BAD); };
    const version = plainVersion(m.version); if (!version) bad();
    let minShell = null;
    if (m.minShell !== undefined && m.minShell !== null) { minShell = plainVersion(m.minShell); if (!minShell) bad(); }
    const electron = plainVersion(m.electron);   // shown only: none where it is no plain version
    const notes = typeof m.notes === 'string' ? cutChars(m.notes, NOTES_MAX) : '';   // shown only: none where it is no text
    const notesUrl = sitePage(m.notesUrl, h);   // shown only: none where it is no page of the site
    if (!Array.isArray(m.files)) bad();
    const zipName = 'waypoint-app-' + version + '.zip';
    let zip = null, installer = null;
    for (const f of m.files.slice(0, FILES_MAX)) {
        if (!f || typeof f !== 'object' || Array.isArray(f) || typeof f.name !== 'string') continue;   // names no file: passed over
        if (f.name === zipName) { if (zip) bad(); zip = cleanFile(f, zipName, version, h); }
        else if (f.name === INSTALLER_NAME) { if (installer) bad(); installer = cleanFile(f, INSTALLER_NAME, version, h); }
    }
    return { version: version, minShell: minShell, electron: electron, notes: notes, notesUrl: notesUrl, zip: zip, installer: installer };
}

/* Look up the latest release and decide what this install can do about it.
   opts: { site (main.js's one constant; UPDATE_SITE where none), currentVersion, shellVersion,
           apiUrl and filesUrl (the suite and the dev server's dry run only: see updateHosts),
           selfInstall (true only where this copy can run the installer over itself: the shell says so, never a request),
           pubKey (the shell's own unless a caller of this module passes another) }
   With no key configured nothing is offered: no list can be vouched for. The answer carries each file's digest and
   signature as the manifest gives them (sha256, sig, installerSig), for applyAppUpdate and downloadInstaller to check. */
async function checkForUpdate(opts) {
    const pubKey = opts.pubKey !== undefined ? opts.pubKey : UPDATE_PUBKEY;
    if (typeof pubKey !== 'string' || !pubKey.trim()) throw new Error(UNSIGNED);
    const h = updateHosts(opts);
    const raw = await fetchBuffer(h.apiUrl, { 'Accept': 'application/json' }, null, ENVELOPE_CAP, u => updateUrlOk(u, h));
    const man = cleanManifest(readEnvelope(raw, pubKey), h);
    const latest = man.version;
    // Each file's own signature over its name, the digest the list gives and the version is checked here too, before anything
    // is offered: a file whose signature does not check is taken as not listed (a zip so falls back on the installer, which is
    // checked on its own), so nothing is offered that the person's press would only see refused. applyAppUpdate and
    // downloadInstaller check it again, and the downloaded bytes against the digest.
    const vouched = f => (f && verifyUpdate(pubKey, f.name, f.sha256, latest, f.sig)) ? f : null;
    const zip = vouched(man.zip), installer = vouched(man.installer);
    const newer = cmpVersion(latest, opts.currentVersion) > 0;   // only a version newer than this one: a list played back from before offers nothing
    const minShell = man.minShell;
    const shellOk = !minShell || cmpVersion(opts.shellVersion || opts.currentVersion, minShell) >= 0;
    const needsInstaller = !!(newer && (!zip || !shellOk));
    return {
        current: opts.currentVersion,
        latest: latest,
        newer: !!newer,
        notes: man.notes,
        page: man.notesUrl || (h.site + '/'),
        appZip: zip ? zip.url : null,
        appZipName: zip ? zip.name : null,   // the zip's own name as the manifest gives it: part of what is signed
        sha256: zip ? zip.sha256 : null,     // the digest the zip's bytes must match
        sig: zip ? zip.sig : null,           // the zip's own signature, over its name, that digest and the version
        installer: installer ? installer.url : null,
        installerSig: installer ? installer.sig : null,
        installerSha256: installer ? installer.sha256 : null,   // the digest the installer's bytes must match (downloadInstaller holds the download to it)
        installerSize: installer ? installer.size : null,   // as the signed list gives it: the exact length downloadInstaller takes, and the words on the page
        minShell: minShell,
        canHotUpdate: !!(newer && zip && shellOk),   // a file of the manifest always has its digest and its signature (cleanFile), and applyAppUpdate checks both
        needsInstaller: needsInstaller,
        // this copy can fetch, check and run the installer by itself: the release must carry the installer (with its signature,
        // which the manifest always gives), and the shell itself must say this copy can run one
        canSelfInstall: !!(needsInstaller && installer && opts.selfInstall === true),
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

/* The outside sheet reader's folder (system/app/private) is not part of any release: the maintainer copies it into an
   install by hand. An update or a restore replaces the whole app folder, so the folder is carried across: copied, never
   moved, from the app in use into the app that takes its place. Only a real folder is carried: a link or a junction named
   private, or one anywhere inside it, is never followed, and the folder is then not carried at all. It is bounded
   (PRIVATE_FILES files, PRIVATE_BYTES bytes): past that it is not carried and the update goes on without it. The answer
   says what became of it (private: 'kept', 'none' or 'left', and privateNote in plain words when it was left). */
const PRIVATE_DIR = 'private';
const PRIVATE_FILES = 2000;
const PRIVATE_BYTES = 64 * 1024 * 1024;
const PRIVATE_LEFT = 'The outside sheet reader in the app folder was not carried over: copy it into the app again.';
// what is under a folder, or why it cannot be carried: { files: [[rel, size]], dirs: [rel] } or { why }
function privateList(dir) {
    let st;
    try { st = fs.lstatSync(dir); } catch (e) { return null; }   // there is none
    if (st.isSymbolicLink() || !st.isDirectory()) return { why: 'not a plain folder' };
    const files = [], dirs = []; let bytes = 0;
    const stack = [''];
    while (stack.length) {
        const rel = stack.pop(), here = path.join(dir, rel);
        for (const name of fs.readdirSync(here)) {
            const r = rel ? path.join(rel, name) : name, s = fs.lstatSync(path.join(dir, r));
            if (s.isSymbolicLink()) return { why: 'it holds a link' };
            if (s.isDirectory()) { dirs.push(r); stack.push(r); continue; }
            if (!s.isFile()) return { why: 'it holds something that is no file' };
            files.push([r, s.size]); bytes += s.size;
            if (files.length > PRIVATE_FILES || bytes > PRIVATE_BYTES) return { why: 'too large' };
        }
        if (dirs.length > PRIVATE_FILES) return { why: 'too large' };
    }
    return { files, dirs };
}
// copy fromApp/private into toDir (which must not exist yet): true when it was copied, null when there was none, false when left
function privateCopy(fromApp, toDir) {
    const src = path.join(fromApp, PRIVATE_DIR), list = privateList(src);
    if (list === null) return null;
    if (list.why) return false;
    try {
        fs.mkdirSync(toDir);
        for (const d of list.dirs.slice().sort((a, b) => a.length - b.length)) fs.mkdirSync(path.join(toDir, d), { recursive: true });
        for (const [r] of list.files) fs.copyFileSync(path.join(src, r), path.join(toDir, r), fs.constants.COPYFILE_EXCL);
        return true;
    } catch (e) { try { rmrf(toDir); } catch (_) {} return false; }
}
// an archive never brings a private folder: a release that holds one is malformed (release.js refuses to pack it)
function privateInArchive(rel) { return rel.split('/')[0].replace(/[. ]+$/, '').toLowerCase() === PRIVATE_DIR; }

/* Verify, download, unpack and swap. opts: { systemDir, appZip, appZipName, sha256 (the digest as the manifest gives it, or
   null), sig (the zip's signature as the manifest gives it, or null), version, pubKey, shellVersion, and site, apiUrl and
   filesUrl as checkForUpdate takes them: the zip is fetched from the update hosts alone }.
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
    const want = typeof opts.sha256 === 'string' ? opts.sha256.trim().toLowerCase() : '';
    if (!/^[0-9a-f]{64}$/.test(want)) throw new Error('unreadable checksum — update aborted');   // an empty or odd digest is a failure, not a pass
    const sigText = typeof opts.sig === 'string' ? opts.sig.trim() : '';
    if (!verifyUpdate(pubKey, opts.appZipName, want, version, sigText)) throw new Error(UNSIGNED);
    // the signature covers the digest; the digest covers every byte of the zip, fetched from the update hosts alone
    const hosts = updateHosts(opts);
    const zipBuf = await fetchBuffer(opts.appZip, null, null, null, u => updateUrlOk(u, hosts));
    const got = crypto.createHash('sha256').update(zipBuf).digest('hex');
    if (want !== got) throw new Error('checksum mismatch — update aborted');
    const entries = readZip(zipBuf);
    if (!entries.length) throw new Error('empty update archive');
    // the zip may hold "app/..." or the files at its root — strip one common leading folder
    let prefix = '';
    const first = entries[0].name.split('/')[0];
    if (entries.every(e => e.name.startsWith(first + '/'))) prefix = first + '/';
    if (!entries.some(e => e.name === prefix + 'index.html')) throw new Error('archive does not contain the app (no index.html)');
    if (entries.some(e => privateInArchive(e.name.slice(prefix.length)))) throw new Error('the update archive holds a private folder — refused');
    let carried = null;
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
        // the outside sheet reader the maintainer added stays: copied into the new app before the swap
        carried = privateCopy(appDir, path.join(newDir, PRIVATE_DIR));
        // swap: app -> app.prev (replacing any older rollback copy), app.new -> app
        rmrf(prevDir);
        fs.renameSync(appDir, prevDir);
        try { fs.renameSync(newDir, appDir); }
        catch (e) { fs.renameSync(prevDir, appDir); throw e; }   // put the old app back if the swap fails
    } catch (e) {
        try { rmrf(newDir); } catch (_) {}   // nothing half-unpacked is left behind
        throw e;
    }
    const out = { ok: true, version: version, previous: prevDir, private: carried === true ? 'kept' : carried === null ? 'none' : 'left' };
    if (carried === false) out.privateNote = PRIVATE_LEFT;
    return out;
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
    // the app that comes back keeps the outside sheet reader of the app in use: copied in beside, then put in place of its own.
    // With none in use, or one that cannot be carried, it keeps whatever it held itself.
    const carry = path.join(prevDir, PRIVATE_DIR + '.carry');
    rmrf(carry);
    const carried = privateCopy(appDir, carry);
    if (carried === true) {
        try { rmrf(path.join(prevDir, PRIVATE_DIR)); fs.renameSync(carry, path.join(prevDir, PRIVATE_DIR)); }
        catch (e) { try { rmrf(carry); } catch (_) {} throw e; }
    }
    rmrf(badDir);
    fs.renameSync(appDir, badDir);
    try { fs.renameSync(prevDir, appDir); }
    catch (e) { fs.renameSync(badDir, appDir); throw e; }   // put the current app back if the swap fails
    try { rmrf(badDir); } catch (e) { /* a leftover is cleared by the next restore */ }
    const out = { ok: true, version: p.prevVersion, private: carried === true ? 'kept' : carried === null ? 'none' : 'left' };
    if (carried === false) out.privateNote = PRIVATE_LEFT;
    return out;
}

/* ---- an update that changes the core: the shell fetches the installer, checks it, and runs it over this copy ---- */

/* Download the installer to a file and check it. opts: { url, sig (its signature as the manifest gives it), sha256 and size
   (its digest and length as the signed list gives them: checkForUpdate's installerSha256 and installerSize), version, pubKey,
   dir, onProgress, onVerify, maxBytes, and site, apiUrl and filesUrl as checkForUpdate takes them }.
   The signed words are the same three lines as the zip's, with the installer's own name the first: a zip's signature never
   stands for an installer, nor the reverse. Before a byte is fetched the signature must check over the listed digest, and the
   listed length must be within the cap; the download is then held to exactly that length (a file of another length on the
   download host is refused at once, never downloaded in full), its bytes to that digest, and the signature is checked once more
   over the digest of what arrived. The bytes go to <dir>/Waypoint_Setup-<version>.exe.part and take their final name only once
   all of that holds; anything else removes them. dir is a fresh private folder the caller made. Returns { file, sha256, version }. */
async function downloadInstaller(opts) {
    const pubKey = opts.pubKey !== undefined ? opts.pubKey : UPDATE_PUBKEY;
    if (typeof pubKey !== 'string' || !pubKey.trim()) throw new Error(UNSIGNED);   // no key configured: nothing can be vouched for
    const version = plainVersion(opts.version);
    if (!version || !opts.url || !opts.sig) throw new Error(UNSIGNED);
    if (typeof opts.dir !== 'string' || !path.isAbsolute(opts.dir) || !fs.statSync(opts.dir).isDirectory()) throw new Error('no folder to download into');
    const file = path.join(opts.dir, 'Waypoint_Setup-' + version + '.exe'), part = file + '.part';
    // the signature first: a release without one that could be a signature costs no download
    const sigText = typeof opts.sig === 'string' ? opts.sig.trim() : '';
    if (!SIG_OK.test(sigText)) throw new Error(UNSIGNED);
    // the listed digest and length: never without them, and the signature must vouch for that digest before anything is fetched
    const want = typeof opts.sha256 === 'string' ? opts.sha256.trim().toLowerCase() : '';
    if (!/^[0-9a-f]{64}$/.test(want) || !Number.isSafeInteger(opts.size) || opts.size <= 0) throw new Error(UNSIGNED);
    if (!verifyUpdate(pubKey, INSTALLER_NAME, want, version, sigText)) throw new Error(UNSIGNED);
    const cap = Math.min(INSTALLER_CAP, (typeof opts.maxBytes === 'number' && opts.maxBytes > 0) ? opts.maxBytes : INSTALLER_CAP);
    if (opts.size > cap) throw new Error('download too large');   // the list names a file past the cap: nothing is asked for
    const hosts = updateHosts(opts);
    try {
        const got = await fetchToFile(opts.url, part, { max: cap, exact: opts.size, onProgress: opts.onProgress, ok: u => updateUrlOk(u, hosts) });
        if (typeof opts.onVerify === 'function') { try { opts.onVerify(); } catch (_) {} }
        if (got.size !== opts.size || got.sha256 !== want) throw new Error(NOT_LISTED);
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
   cfg: { site, currentVersion, shellVersion, systemDir, apiUrl and filesUrl (the dev server's dry run only), and for an update that changes the core:
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
                res.end(JSON.stringify(Object.assign({}, cache, prevInfo(cfg.systemDir, cfg.shellVersion), { installFailed: installFailed(cfg) })));
            } catch (e) {
                res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
                res.end(JSON.stringify(Object.assign({ current: cfg.currentVersion, error: String(e.message || e), page: updateHosts(cfg).site + '/' }, prevInfo(cfg.systemDir, cfg.shellVersion), { installFailed: installFailed(cfg) })));   // the way back needs no network; the site's own page stands in for the walk-through (the page names no address of its own)
            }
            return true;
        }
        if (url.pathname === '/api/update-apply' && req.method === 'POST') {
            try {
                const info = await checkForUpdate(cfg);
                if (!info.canHotUpdate) throw new Error(info.needsInstaller ? 'this update needs the installer' : 'already up to date');
                const r = await applyAppUpdate({ systemDir: cfg.systemDir, appZip: info.appZip, appZipName: info.appZipName, sha256: info.sha256, sig: info.sig, version: info.latest, pubKey: cfg.pubKey, shellVersion: cfg.shellVersion, site: cfg.site, apiUrl: cfg.apiUrl, filesUrl: cfg.filesUrl });
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
                    const r = await downloadInstaller({ url: info.installer, sig: info.installerSig, sha256: info.installerSha256, size: info.installerSize, version: info.latest, pubKey: cfg.pubKey, dir: job.dir, maxBytes: cfg.maxInstallerBytes, site: cfg.site, apiUrl: cfg.apiUrl, filesUrl: cfg.filesUrl,
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

module.exports = { cmpVersion, checkForUpdate, applyAppUpdate, rollbackAppUpdate, prevInfo, signedText, verifyUpdate, readZip, makeHandler, fetchBuffer, PRIVATE_FILES, PRIVATE_BYTES,
    fetchToFile, downloadInstaller, runInstaller, sweepInstallerDirs, installFailed, UPDATE_ROUTES, INSTALLER_NAME, INSTALLER_ARGS,
    UPDATE_SITE, MANIFEST_PREFIX, NOTES_MAX, LIST_UNSIGNED, LIST_BAD, NOT_OURS, NOT_LISTED, INSTALLER_CAP, updateHosts, updateUrlOk, sitePage, verifyManifest, readEnvelope, cleanManifest };
