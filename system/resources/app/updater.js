/* Waypoint self-update — shared by the Electron shell (main.js) and tools/dev-server.js.

   Releases live on a public GitHub repository. Each release is tagged with the version
   (e.g. "1.1.3" or "v1.1.3") and carries these assets:
     waypoint-app-<version>.zip          the system/app folder (the whole front end)
     waypoint-app-<version>.zip.sha256   hex digest of that zip (optional but recommended)
     manifest.json                       { "version": "1.1.3", "minShell": "1.1.2" }
     Waypoint_Setup.exe                  the full installer (for shell changes / fresh installs)

   Hot update = download the zip, verify it, unpack into system/app.new, swap it in. The
   Electron shell keeps serving from disk, so a page reload picks up the new build. When a
   release needs a newer shell (manifest.minShell > our version) the app is told to fetch
   the installer instead. No dependencies: plain https + zlib + a minimal ZIP reader. */
'use strict';
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const UA = 'Waypoint-updater';

function cmpVersion(a, b) {
    const pa = String(a || '0').replace(/^v/i, '').split('-')[0].split('.').map(n => parseInt(n, 10) || 0);
    const pb = String(b || '0').replace(/^v/i, '').split('-')[0].split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
    return 0;
}

// GET with redirects (GitHub asset downloads bounce through a CDN). Resolves a Buffer.
function fetchBuffer(url, headers, redirects) {
    redirects = redirects == null ? 5 : redirects;
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const mod = u.protocol === 'http:' ? http : https;
        const req = mod.get(u, { headers: Object.assign({ 'User-Agent': UA, 'Accept': '*/*' }, headers || {}) }, res => {
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0) {
                res.resume();
                return resolve(fetchBuffer(new URL(res.headers.location, url).href, headers, redirects - 1));
            }
            if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode + ' for ' + url)); }
            const chunks = []; let size = 0;
            res.on('data', c => { chunks.push(c); size += c.length; if (size > 200 * 1024 * 1024) { req.destroy(new Error('download too large')); } });
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        });
        req.on('error', reject);
        req.setTimeout(60000, () => req.destroy(new Error('timeout for ' + url)));
    });
}

/* Look up the latest release and decide what this install can do about it.
   opts: { repo: 'owner/name', currentVersion, shellVersion, apiUrl (override for tests) } */
async function checkForUpdate(opts) {
    const apiUrl = opts.apiUrl || ('https://api.github.com/repos/' + opts.repo + '/releases/latest');
    const rel = JSON.parse((await fetchBuffer(apiUrl, { 'Accept': 'application/vnd.github+json' })).toString('utf8'));
    const latest = String(rel.tag_name || rel.name || '').replace(/^v/i, '');
    const assets = Array.isArray(rel.assets) ? rel.assets : [];
    const find = re => assets.find(a => re.test(a.name || ''));
    const zip = find(/^waypoint-app-.*\.zip$/i);
    const sha = find(/^waypoint-app-.*\.zip\.sha256$/i);
    const manifestAsset = find(/^manifest\.json$/i);
    const installer = find(/^Waypoint_Setup\.exe$/i);
    let manifest = {};
    if (manifestAsset) { try { manifest = JSON.parse((await fetchBuffer(manifestAsset.browser_download_url)).toString('utf8')); } catch (e) { manifest = {}; } }
    const newer = latest && cmpVersion(latest, opts.currentVersion) > 0;
    const minShell = manifest.minShell || null;
    const shellOk = !minShell || cmpVersion(opts.shellVersion || opts.currentVersion, minShell) >= 0;
    return {
        current: opts.currentVersion,
        latest: latest || null,
        newer: !!newer,
        notes: rel.body || '',
        page: rel.html_url || ('https://github.com/' + opts.repo + '/releases'),
        appZip: zip ? zip.browser_download_url : null,
        sha256: sha ? sha.browser_download_url : null,
        installer: installer ? installer.browser_download_url : null,
        minShell: minShell,
        canHotUpdate: !!(newer && zip && shellOk),
        needsInstaller: !!(newer && (!zip || !shellOk)),
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
            if (e.method === 8) return zlib.inflateRawSync(raw);
            throw new Error('unsupported compression for ' + e.name);
        },
    }));
}

function rmrf(p) { if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true }); }

/* Download, verify, unpack and swap. opts: { systemDir, appZip, sha256 (url|null), version }
   Returns { ok, version, previous } — the previous app folder is kept as app.prev for one rollback. */
async function applyAppUpdate(opts) {
    const systemDir = opts.systemDir;
    const appDir = path.join(systemDir, 'app');
    const newDir = path.join(systemDir, 'app.new');
    const prevDir = path.join(systemDir, 'app.prev');
    const zipBuf = await fetchBuffer(opts.appZip);
    if (opts.sha256) {
        const want = (await fetchBuffer(opts.sha256)).toString('utf8').trim().split(/\s+/)[0].toLowerCase();
        const got = crypto.createHash('sha256').update(zipBuf).digest('hex');
        if (want && want !== got) throw new Error('checksum mismatch — update aborted');
    }
    const entries = readZip(zipBuf);
    if (!entries.length) throw new Error('empty update archive');
    // the zip may hold "app/..." or the files at its root — strip one common leading folder
    let prefix = '';
    const first = entries[0].name.split('/')[0];
    if (entries.every(e => e.name.startsWith(first + '/'))) prefix = first + '/';
    if (!entries.some(e => e.name === prefix + 'index.html')) throw new Error('archive does not contain the app (no index.html)');
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
    // swap: app -> app.prev (replacing any older rollback copy), app.new -> app
    rmrf(prevDir);
    fs.renameSync(appDir, prevDir);
    try { fs.renameSync(newDir, appDir); }
    catch (e) { fs.renameSync(prevDir, appDir); throw e; }   // put the old app back if the swap fails
    return { ok: true, version: opts.version, previous: prevDir };
}

/* Wire the three endpoints onto any (req, res, url) dispatcher. cfg: { repo, currentVersion, shellVersion, systemDir, apiUrl } */
function makeHandler(cfg) {
    let cache = null, cacheAt = 0;
    return async function handle(req, res, url) {
        if (url.pathname === '/api/update-check' && req.method === 'GET') {
            try {
                const force = url.searchParams.get('force') === '1';
                if (!cache || force || Date.now() - cacheAt > 15 * 60 * 1000) { cache = await checkForUpdate(cfg); cacheAt = Date.now(); }
                res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
                res.end(JSON.stringify(Object.assign({ repo: cfg.repo }, cache)));
            } catch (e) {
                res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
                res.end(JSON.stringify({ repo: cfg.repo, current: cfg.currentVersion, error: String(e.message || e) }));
            }
            return true;
        }
        if (url.pathname === '/api/update-apply' && req.method === 'POST') {
            try {
                const info = await checkForUpdate(cfg);
                if (!info.canHotUpdate) throw new Error(info.needsInstaller ? 'this update needs the installer' : 'already up to date');
                const r = await applyAppUpdate({ systemDir: cfg.systemDir, appZip: info.appZip, sha256: info.sha256, version: info.latest });
                cache = null;
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(r));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
            }
            return true;
        }
        return false;
    };
}

module.exports = { cmpVersion, checkForUpdate, applyAppUpdate, readZip, makeHandler, fetchBuffer };
