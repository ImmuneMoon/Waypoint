/* Waypoint dev server — runs the app from source in an ordinary browser.
   Mirrors the HTTP API of the Electron shell (system/resources/app/main.js) so the
   front end in system/app works unchanged.  Usage:
       node tools/dev-server.js [savesDir] [port]
   Defaults: savesDir = ./dev-saves (never your real saves), port = 3999.
   Open http://localhost:3999 in a browser. */
const http = require('http');
const fs = require('fs');
const path = require('path');

const appDir = path.join(__dirname, '..', 'system', 'app');
const savesDir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'dev-saves'));
const port = parseInt(process.argv[3], 10) || 3999;
if (!fs.existsSync(savesDir)) fs.mkdirSync(savesDir, { recursive: true });
const dataFile = path.join(savesDir, 'data.json');

// Self-update endpoints, same module the shell uses. For a dry run against a mock release set
//   WAYPOINT_UPDATE_API=http://localhost:3999/saves/mock-release.json   (a GitHub-shaped JSON)
//   WAYPOINT_SYSTEM_DIR=<a scratch copy of system/>                     (never the repo's own)
// Without a scratch folder named — or with the source tree's own system folder named, under any spelling — the dev server
// changes nothing: Update and Restore answer 409 and the tree it runs from stays as it is (the check itself still answers).
const updater = require('../system/resources/app/updater');
const libstore = require('../system/resources/app/libstore');   // Stage 6 library L1b: the shell's own pack store
const servefile = require('../system/resources/app/servefile');   // item 21 V1: the shell's own file serving (media types, byte ranges)
const reqguard = require('../system/resources/app/reqguard');   // the shell's own rules for what the server takes and refuses (names, sizes, bodies, backups, the launch secret)
const shellguard = require('../system/resources/app/shellguard');   // the shell's own rules: which folder an update may change, the loopback listen
const shellPkg = require('../system/resources/app/package.json');
const UPDATE_REPO = (fs.readFileSync(path.join(__dirname, '..', 'system', 'resources', 'app', 'main.js'), 'utf8').match(/const UPDATE_REPO = '([^']+)'/) || [])[1] || 'owner/repo';
const ownSystem = path.join(__dirname, '..', 'system');
const scratchSystem = shellguard.scratchSystemDir(ownSystem, process.env.WAYPOINT_SYSTEM_DIR);   // null: no folder this server may change
const updateHandler = updater.makeHandler({
    repo: UPDATE_REPO, currentVersion: shellPkg.version, shellVersion: shellPkg.version,
    systemDir: scratchSystem || ownSystem,
    apiUrl: process.env.WAYPOINT_UPDATE_API || undefined,
});

// mirrors main.js: only this server's own pages may talk to it — no CORS, a foreign Origin / Sec-Fetch-Site / Host is refused
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];
// Names that become disk paths (a map id, a file name, an upload's kind and size, what may be deleted) are judged by reqguard.js, as in the shell.
// The launch secret: the shell makes one at each launch and its windows send it with every request. An ordinary browser cannot, so this
// server runs WITHOUT one (scratch saves only) unless WAYPOINT_LAUNCH_SECRET sets it (at least 32 characters; a shorter one passes nothing) —
// then every request must carry it in the X-Waypoint-Launch header, checked first, as the shell does.
const LAUNCH_SECRET = process.env.WAYPOINT_LAUNCH_SECRET || '';
// A request that throws must not take the whole app (and every joined player) down with it.
process.on('uncaughtException', (e) => { try { console.error('[waypoint] uncaught exception (kept running):', e && e.stack || e); } catch (_) {} });
function localRequest(req) {
    const host = String(req.headers.host || '').toLowerCase();
    if (!LOCAL_HOSTS.some(h => host === h + ':' + port || host === h)) return false;
    const sfs = req.headers['sec-fetch-site'];
    if (sfs && sfs !== 'same-origin' && sfs !== 'none') return false;
    const origin = req.headers.origin;
    if (origin === undefined) return true;
    let o; try { o = new URL(origin); } catch (e) { return false; }
    return o.protocol === 'http:' && LOCAL_HOSTS.some(h => o.host.toLowerCase() === h + ':' + port);
}

const server = http.createServer((req, res) => {
    if (LAUNCH_SECRET && !reqguard.launchOk(req, LAUNCH_SECRET)) { res.writeHead(403, { 'Content-Type': 'text/plain' }); return res.end('Forbidden'); }   // first, as the shell: nothing for a request without the secret
    if (!localRequest(req)) { res.writeHead(403, { 'Content-Type': 'text/plain' }); return res.end('Forbidden'); }
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    const url = new URL(req.url, 'http://localhost');
    if (!scratchSystem && req.method === 'POST' && updater.UPDATE_ROUTES.includes(url.pathname)) {   // the dev server never updates, restores or installs over the source tree it runs from
        res.writeHead(409, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: 'the dev server never changes the source tree: set WAYPOINT_SYSTEM_DIR to a scratch copy of system/ to try an update' }));
    }
    if (updater.UPDATE_ROUTES.includes(url.pathname)) { updateHandler(req, res, url); return; }   // the shell's own list (a core update's routes too: here they answer that this copy cannot install one)
    if (url.pathname === '/api/open-external' && req.method === 'POST') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"ok":true,"note":"dev server: not opening a browser"}'); }
    if (url.pathname === '/api/ping') { res.writeHead(200); return res.end(); }
    if (url.pathname === '/api/version') {
        let v = shellPkg.version;
        try { const j = JSON.parse(fs.readFileSync(path.join(appDir, 'version.json'), 'utf8')); if (j.version && updater.cmpVersion(j.version, v) > 0) v = j.version; } catch (e) {}
        res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ version: v + '-dev', shell: shellPkg.version }));
    }

    // Shared table preferences: saves/preferences.json mirrors the browser's wp_* settings so
    // they travel with the saves folder (and survive a different install / cleared profile).
    // GET  /api/prefs     -> the JSON object (or {})
    // POST /api/prefs     -> replace it (atomic write); body {updated: <ms>, prefs: {wp_*: string}}
    // GET  /api/prefs.js  -> classic script that sets window.wpFilePrefs before the app's modules load
    if (url.pathname === '/api/prefs' || url.pathname === '/api/prefs.js') {
        const prefsFile = path.join(path.dirname(dataFile), 'preferences.json');
        if (req.method === 'GET') {
            if (req.headers['sec-fetch-site'] !== 'same-origin') { res.writeHead(403); return res.end('Forbidden'); }   // the profile store (table keys included) only ever goes to this app's own page: a classic script include from a page elsewhere sends no Origin, so the browser's own signal is required
            let json = '{}';
            try { if (fs.existsSync(prefsFile)) { json = fs.readFileSync(prefsFile, 'utf8'); JSON.parse(json); } } catch (e) { json = '{}'; }
            if (url.pathname === '/api/prefs.js') {
                res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' });
                return res.end('window.wpFilePrefs = ' + json + ';');
            }
            res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
            return res.end(json);
        }
        if (req.method === 'POST') {
            reqguard.readBody(req, res, reqguard.BODY.prefs, (body) => {   // read with a cap (413 past 2 MB, before it is held), decoded as UTF-8 across chunks
                let parsed;
                try { parsed = JSON.parse(body); } catch (e) { res.writeHead(400); return res.end('{"error":"invalid json"}'); }
                if (!parsed || typeof parsed !== 'object' || typeof parsed.prefs !== 'object' || body.length > 2 * 1024 * 1024) { res.writeHead(400); return res.end('{"error":"bad prefs"}'); }
                try {
                    const tmp = prefsFile + '.tmp';
                    fs.writeFileSync(tmp, JSON.stringify(parsed, null, 1), 'utf8');
                    fs.renameSync(tmp, prefsFile);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end('{"success":true}');
                } catch (e) { res.writeHead(500); res.end('{"error":"write failed"}'); }
            });
            return;
        }
    }
    // Snapshots of the save: the launch backups in saves/backups plus ones taken by hand (keep-*, never pruned)
    if (url.pathname === '/api/backups' && req.method === 'GET') {
        try {
            const bkDir = path.join(savesDir, 'backups');
            const list = fs.existsSync(bkDir) ? fs.readdirSync(bkDir).filter(f => /^(data|keep)-[A-Za-z0-9_-]+\.json$/.test(f)).map(f => { const st = fs.statSync(path.join(bkDir, f)); return { file: f, size: st.size, at: st.mtimeMs, kept: f.indexOf('keep-') === 0 }; }).sort((a, b) => b.at - a.at) : [];
            res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(list));
        } catch (e) { res.writeHead(500); return res.end('{"error":"list failed"}'); }
    }
    if (url.pathname === '/api/backup-now' && req.method === 'POST') {
        try {
            if (!fs.existsSync(dataFile)) { res.writeHead(404); return res.end('{"error":"no save yet"}'); }
            const bkDir = path.join(savesDir, 'backups');
            if (!fs.existsSync(bkDir)) fs.mkdirSync(bkDir, { recursive: true });
            const f = 'keep-' + new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19) + '.json';
            fs.copyFileSync(dataFile, path.join(bkDir, f));
            libstore.snapshot(savesDir, bkDir, f.replace(/\.json$/, ''));   // and the library's files as they are (L1b)
            res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: true, file: f }));
        } catch (e) { res.writeHead(500); return res.end('{"error":"snapshot failed"}'); }
    }
    if ((url.pathname === '/api/restore-backup' || url.pathname === '/api/delete-backup') && req.method === 'POST') {
        reqguard.readBody(req, res, reqguard.BODY.small, (body) => {   // read with a cap (413 past 64 KB), decoded as UTF-8 across chunks
            try {
                const file = String((JSON.parse(body || '{}') || {}).file || '');
                if (!/^(data|keep)-[A-Za-z0-9_-]+\.json$/.test(file)) { res.writeHead(400); return res.end('{"error":"bad name"}'); }
                const bkDir = path.join(savesDir, 'backups'), src = path.join(bkDir, file);
                if (!fs.existsSync(src)) { res.writeHead(404); return res.end('{"error":"no such snapshot"}'); }
                if (url.pathname === '/api/delete-backup') { reqguard.removeBackup(bkDir, file, libstore); res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"ok":true}'); }   // a snapshot taken by hand goes; a launch backup is moved into backups/removed, never erased (no route reaches it there)
                const text = fs.readFileSync(src, 'utf8');
                JSON.parse(text);   // a snapshot that does not parse is not restored
                if (fs.existsSync(dataFile) && fs.statSync(dataFile).size > 2) { const bf = 'keep-' + new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19) + '-before-restore'; fs.copyFileSync(dataFile, path.join(bkDir, bf + '.json')); libstore.snapshot(savesDir, bkDir, bf); }
                fs.writeFileSync(dataFile + '.tmp', text, 'utf8');
                fs.renameSync(dataFile + '.tmp', dataFile);
                libstore.restore(savesDir, bkDir, file.replace(/\.json$/, ''));   // the library files that save pins, where they are gone (L1b)
                res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}');
            } catch (e) { res.writeHead(500); res.end('{"error":"restore failed"}'); }
        });
        return;
    }
    if (url.pathname === '/api/library') { libstore.handle(req, res, url, savesDir); return; }   // Stage 6 library L1b: pack files beside the save (libstore.js)
    if (url.pathname === '/api/data') {
        if (req.method === 'GET') {
            let json = '{}';
            if (fs.existsSync(dataFile)) json = fs.readFileSync(dataFile, 'utf8');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(json);
        }
        if (req.method === 'POST') {
            reqguard.readBody(req, res, reqguard.BODY.data, (body) => {   // read with a cap (413 past 512 MB), decoded as UTF-8 across chunks; a write that fails answers 500
                try { JSON.parse(body); } catch (e) { res.writeHead(400); return res.end('{"error":"invalid json"}'); }
                const tmp = dataFile + '.tmp';
                fs.writeFileSync(tmp, body, 'utf8');
                fs.renameSync(tmp, dataFile);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end('{"success":true}');
            });
            return;
        }
    }
    if (url.pathname === '/api/list-images' && req.method === 'GET') {
        const imgRoot = path.join(savesDir, 'images');
        const out = [];
        (function walk(dir, rel) {
            let names = [];
            try { names = fs.readdirSync(dir); } catch (e) { return; }
            names.forEach(n => {
                const full = path.join(dir, n);
                let st; try { st = fs.statSync(full); } catch (e) { return; }
                if (st.isDirectory()) walk(full, rel + n + '/');
                else if (/\.(png|jpe?g|gif|webp|svg)$/i.test(n)) out.push({ path: '/saves/images/' + rel + n, folder: rel.replace(/\/$/, ''), name: n, size: st.size, mtime: st.mtimeMs });
            });
        })(imgRoot, '');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(out));
    }
    if (url.pathname === '/api/log' && req.method === 'POST') {
        reqguard.readBody(req, res, reqguard.BODY.small, () => { res.writeHead(200); res.end(); });   // the dev server keeps no log: the line is read (with the shell's cap) and dropped
        return;
    }
    if (url.pathname === '/api/delete-image' && req.method === 'POST') {
        // Delete one picture file under saves/images (the Image Library's Delete picture). The save itself is
        // untouched: anything still referencing the path simply shows a broken picture until re-pointed.
        reqguard.readBody(req, res, reqguard.BODY.small, (body) => {   // read with a cap (413 past 64 KB), decoded as UTF-8 across chunks
            try {
                // never a file of the Journal's by the Image Library's word; by the Journal's own (journal: true) only a page's picture, never an index
                const want = JSON.parse(body || '{}') || {};
                const segs = reqguard.deleteTarget(want.path, want.journal === true);
                if (!segs) { res.writeHead(400); return res.end('{"error":"bad path"}'); }
                const file = path.resolve(savesDir, ...segs), imagesRoot = path.resolve(savesDir, 'images');
                if (!file.startsWith(imagesRoot + path.sep)) { res.writeHead(400); return res.end('{"error":"bad path"}'); }   // and inside images/, whatever the segments spelled
                if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('{"error":"no such picture"}'); }
                fs.unlinkSync(file);
                res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}');
            } catch (e) { res.writeHead(500); res.end('{"error":"delete failed"}'); }
        });
        return;
    }
    if (url.pathname === '/api/upload-exact' && req.method === 'POST') {
        const relRaw = url.searchParams.get('path') || '';
        let rel = relRaw; try { rel = decodeURIComponent(relRaw); } catch (e) { rel = relRaw; }   // a name with a bare % is itself, never an exception that leaves the request unanswered
        const segs = rel.split('/').filter(Boolean);
        // only what the app itself writes: a picture, a sound, a video, the Journal's own two index files — plain segments, never a
        // script, a shortcut or any other kind of file under saves/ — and an import's copy (keep=1) never into the Journal
        const keep = url.searchParams.get('keep') === '1', kind = reqguard.exactKind(segs, keep);
        if (!kind) { res.writeHead(400); res.end('bad path'); return; }
        const savePath = path.resolve(savesDir, ...segs), imagesRoot = path.resolve(savesDir, 'images');
        if (!savePath.startsWith(imagesRoot + path.sep)) { res.writeHead(400); res.end('bad path'); return; }   // and inside images/, whatever the segments spelled
        try {
            fs.mkdirSync(path.dirname(savePath), { recursive: true });
            servefile.saveUpload(req, res, savePath, JSON.stringify({ url: '/saves/' + segs.join('/') }), { keep: keep, max: reqguard.UPLOAD_MAX[kind] });   // whole or not at all: a copy cut short never replaces a good file; keep=1 (an import): never over a file already there (409); past its kind's size: 413
        } catch (e) { res.writeHead(500); res.end('{"error":"upload failed"}'); }
        return;
    }
    if (url.pathname === '/api/upload' && req.method === 'POST') {
        // the folder is a map id (audio: audio/<camp>) and the name a file name — plain segments, nothing that walks,
        // only a picture, a sound or a video — and the result must sit under saves/images whatever the parts spelled
        const mapId = url.searchParams.get('mapId') || 'unknown';
        const rawName = url.searchParams.get('filename') || 'image.png';
        const kind = reqguard.freshKind(mapId, rawName);
        if (!kind) { res.writeHead(400); return res.end('{"error":"bad name"}'); }
        const filename = (Math.random().toString(36).substring(2, 10)) + '_' + rawName;
        const imagesRoot = path.resolve(savesDir, 'images'), mapDir = path.resolve(imagesRoot, mapId), savePath = path.resolve(mapDir, filename);
        if (!mapDir.startsWith(imagesRoot + path.sep) || !savePath.startsWith(mapDir + path.sep)) { res.writeHead(400); return res.end('{"error":"bad path"}'); }
        try {
            if (!fs.existsSync(mapDir)) fs.mkdirSync(mapDir, { recursive: true });
            servefile.saveUpload(req, res, savePath, JSON.stringify({ url: '/saves/images/' + mapId + '/' + filename }), { max: reqguard.UPLOAD_MAX[kind] });   // answered once the bytes are on disk, whole; an upload cut short leaves no file; past its kind's size: 413 (a video: any size)
        } catch (e) { res.writeHead(500); res.end('{"error":"upload failed"}'); }
        return;
    }

    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch (e) { pathname = url.pathname; }
    if (pathname.includes('..') || pathname.includes('\0')) { res.writeHead(400); return res.end('Bad path'); }
    if (reqguard.savesHidden(pathname)) { res.writeHead(404); return res.end('Not Found'); }   // the save, the profile store and the log are read through their own routes, never as files
    let filePath, root;
    if (pathname.startsWith('/saves/')) {
        root = savesDir;
        filePath = path.join(root, pathname.substring(7));
    } else {
        let p = pathname === '/' ? '/index.html' : pathname;
        root = appDir;
        filePath = path.join(root, p);
    }
    // mirrors main.js: the resolved file must sit inside its root (saves/ or the app folder), whatever the parser made of the path
    root = path.resolve(root); filePath = path.resolve(filePath);
    if (filePath !== root && !filePath.startsWith(root + path.sep)) { res.writeHead(400); return res.end('Bad path'); }
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const mimes = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
        const underSaves = pathname.startsWith('/saves/'), mime = servefile.mediaType(ext) || (underSaves ? shellguard.savesType(mimes[ext] || 'text/plain') : mimes[ext] || 'text/plain');   // as main.js: nothing under saves/ is answered as a page, a script or a stylesheet
        servefile.serveFile(req, res, filePath, Object.assign({ 'Content-Type': mime, 'Cache-Control': 'no-cache, no-store, must-revalidate' }, underSaves ? { 'Content-Security-Policy': 'sandbox', 'X-Content-Type-Options': 'nosniff' } : shellguard.pageHeaders(mime, path.join(savesDir, 'preferences.json'))));   // item 21 V1: as main.js — a media file's own type, its length and a byte range when asked for; a page of the app carries the policy for what it may run and load (shellguard.pagePolicy)
    } else {
        res.writeHead(404); res.end('Not Found');
    }
});

server.requestTimeout = 0;   // as the shell: a large video copied in may take longer than Node's five minutes a request
// as the shell: both loopback addresses of the port, or neither ("localhost" names both). The port is the one asked for — a
// browser tab and .claude/launch.json name it — so where another program holds either address this says so and stops.
const server6 = http.createServer((req, res) => server.emit('request', req, res));
server6.requestTimeout = 0;
shellguard.listenLoopback(server, server6, port, (held) => {
    if (!held) { console.error('Waypoint dev server: port ' + port + ' is taken (on 127.0.0.1 or on [::1]). Stop the program that holds it, or give another port.'); process.exit(1); }
    console.log('Waypoint dev server: http://localhost:' + port + '  (saves: ' + savesDir + ')');
}, 0);
