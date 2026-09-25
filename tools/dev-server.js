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
const updater = require('../system/resources/app/updater');
const shellPkg = require('../system/resources/app/package.json');
const UPDATE_REPO = (fs.readFileSync(path.join(__dirname, '..', 'system', 'resources', 'app', 'main.js'), 'utf8').match(/const UPDATE_REPO = '([^']+)'/) || [])[1] || 'owner/repo';
const updateHandler = updater.makeHandler({
    repo: UPDATE_REPO, currentVersion: shellPkg.version, shellVersion: shellPkg.version,
    systemDir: process.env.WAYPOINT_SYSTEM_DIR || path.join(__dirname, '..', 'system'),
    apiUrl: process.env.WAYPOINT_UPDATE_API || undefined,
});

// mirrors main.js: only this server's own pages may talk to it — no CORS, a foreign Origin / Sec-Fetch-Site / Host is refused
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];
// Names that become disk paths: a map id is one plain segment (audio lives one folder deeper: audio/<camp>), a file
// name has no separators and is never a page or a script (the static branch would serve it as one).
const SAFE_MAP_ID = /^[A-Za-z0-9_.-]{1,80}(\/[A-Za-z0-9_.-]{1,80})?$/;
const FILE_EXT_BAD = /\.(html?|xhtml|xml|js|mjs|cjs|css|php|exe|bat|cmd|ps1|vbs|hta|jar|msi|dll|scr|lnk|url|com|pif)$/i;
function safeSeg(s) { return typeof s === 'string' && s.length > 0 && s.length <= 200 && s !== '.' && s !== '..' && !/[\/\\\0:*?"<>|]/.test(s) && !s.includes('..'); }
function safeMapId(m) { return SAFE_MAP_ID.test(m) && m.split('/').every(safeSeg); }
function safeFileName(n) { return safeSeg(n) && !n.startsWith('.') && !FILE_EXT_BAD.test(n); }
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
    if (!localRequest(req)) { res.writeHead(403, { 'Content-Type': 'text/plain' }); return res.end('Forbidden'); }
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/update-check' || url.pathname === '/api/update-apply') { updateHandler(req, res, url); return; }
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
            let body = '';
            req.setEncoding('utf8'); req.on('data', chunk => body += chunk);   // 1.5.0: decoded as UTF-8 across chunks (a character split between two chunks was saved as \uFFFD)
            req.on('end', () => {
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
            res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: true, file: f }));
        } catch (e) { res.writeHead(500); return res.end('{"error":"snapshot failed"}'); }
    }
    if ((url.pathname === '/api/restore-backup' || url.pathname === '/api/delete-backup') && req.method === 'POST') {
        let body = '';
        req.setEncoding('utf8'); req.on('data', c => body += c);   // 1.5.0: decoded as UTF-8 across chunks (a character split between two chunks was saved as \uFFFD)
        req.on('end', () => {
            try {
                const file = String((JSON.parse(body || '{}') || {}).file || '');
                if (!/^(data|keep)-[A-Za-z0-9_-]+\.json$/.test(file)) { res.writeHead(400); return res.end('{"error":"bad name"}'); }
                const bkDir = path.join(savesDir, 'backups'), src = path.join(bkDir, file);
                if (!fs.existsSync(src)) { res.writeHead(404); return res.end('{"error":"no such snapshot"}'); }
                if (url.pathname === '/api/delete-backup') { fs.unlinkSync(src); res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"ok":true}'); }
                const text = fs.readFileSync(src, 'utf8');
                JSON.parse(text);   // a snapshot that does not parse is not restored
                if (fs.existsSync(dataFile) && fs.statSync(dataFile).size > 2) fs.copyFileSync(dataFile, path.join(bkDir, 'keep-' + new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19) + '-before-restore.json'));
                fs.writeFileSync(dataFile + '.tmp', text, 'utf8');
                fs.renameSync(dataFile + '.tmp', dataFile);
                res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}');
            } catch (e) { res.writeHead(500); res.end('{"error":"restore failed"}'); }
        });
        return;
    }
    if (url.pathname === '/api/data') {
        if (req.method === 'GET') {
            let json = '{}';
            if (fs.existsSync(dataFile)) json = fs.readFileSync(dataFile, 'utf8');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(json);
        }
        if (req.method === 'POST') {
            let body = '';
            req.setEncoding('utf8'); req.on('data', c => body += c);   // 1.5.0: decoded as UTF-8 across chunks (a character split between two chunks was saved as \uFFFD)
            req.on('end', () => {
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
        let body = '';
        req.setEncoding('utf8'); req.on('data', c => body += c);   // 1.5.0: decoded as UTF-8 across chunks (a character split between two chunks was saved as \uFFFD)
        req.on('end', () => { res.writeHead(200); res.end(); });
        return;
    }
    if (url.pathname === '/api/delete-image' && req.method === 'POST') {
        // Delete one picture file under saves/images (the Image Library's Delete picture). The save itself is
        // untouched: anything still referencing the path simply shows a broken picture until re-pointed.
        let body = '';
        req.setEncoding('utf8'); req.on('data', c => body += c);   // 1.5.0: decoded as UTF-8 across chunks (a character split between two chunks was saved as \uFFFD)
        req.on('end', () => {
            try {
                const p = String((JSON.parse(body || '{}') || {}).path || '').replace(/^\/saves\//, '');
                const segs = p.split('/').filter(Boolean);
                const bad = segs.length < 2 || segs[0] !== 'images' || segs.some(s => s === '.' || s === '..' || s.includes('\\') || s.includes(':'));
                if (bad) { res.writeHead(400); return res.end('{"error":"bad path"}'); }
                const file = path.join(savesDir, ...segs);
                if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('{"error":"no such picture"}'); }
                fs.unlinkSync(file);
                res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}');
            } catch (e) { res.writeHead(500); res.end('{"error":"delete failed"}'); }
        });
        return;
    }
    if (url.pathname === '/api/upload-exact' && req.method === 'POST') {
        const rel = decodeURIComponent(url.searchParams.get('path') || '');
        const segs = rel.split('/').filter(Boolean);
        const bad = !segs.length || segs[0] !== 'images' || segs.length < 2 || segs.length > 6 ||
            segs.some(s => !safeSeg(s)) || FILE_EXT_BAD.test(segs[segs.length - 1]);   // never a page or a script under saves/
        if (bad) { res.writeHead(400); res.end('bad path'); return; }
        const savePath = path.resolve(savesDir, ...segs), imagesRoot = path.resolve(savesDir, 'images');
        if (!savePath.startsWith(imagesRoot + path.sep)) { res.writeHead(400); res.end('bad path'); return; }   // and inside images/, whatever the segments spelled
        try {
            fs.mkdirSync(path.dirname(savePath), { recursive: true });
            const ws = fs.createWriteStream(savePath);
            ws.on('error', () => { try { res.writeHead(500); res.end('{"error":"write failed"}'); } catch (e) {} });   // a bad write answers, never crashes the process
            req.on('error', () => { try { ws.destroy(); } catch (e) {} });
            req.pipe(ws);
            ws.on('finish', () => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ url: '/saves/' + segs.join('/') }));
            });
        } catch (e) { res.writeHead(500); res.end('{"error":"upload failed"}'); }
        return;
    }
    if (url.pathname === '/api/upload' && req.method === 'POST') {
        // the folder is a map id (audio: audio/<camp>) and the name a file name — plain segments, nothing that walks,
        // never a page or a script — and the result must sit under saves/images whatever the parts spelled
        const mapId = url.searchParams.get('mapId') || 'unknown';
        const rawName = url.searchParams.get('filename') || 'image.png';
        if (!safeMapId(mapId) || !safeFileName(rawName)) { res.writeHead(400); return res.end('{"error":"bad name"}'); }
        const filename = (Math.random().toString(36).substring(2, 10)) + '_' + rawName;
        const imagesRoot = path.resolve(savesDir, 'images'), mapDir = path.resolve(imagesRoot, mapId), savePath = path.resolve(mapDir, filename);
        if (!mapDir.startsWith(imagesRoot + path.sep) || !savePath.startsWith(mapDir + path.sep)) { res.writeHead(400); return res.end('{"error":"bad path"}'); }
        try {
            if (!fs.existsSync(mapDir)) fs.mkdirSync(mapDir, { recursive: true });
            const ws = fs.createWriteStream(savePath);
            ws.on('error', () => { try { res.writeHead(500); res.end('{"error":"write failed"}'); } catch (e) {} });
            req.on('error', () => { try { ws.destroy(); } catch (e) {} });
            req.pipe(ws);
            ws.on('finish', () => {   // answered once the bytes are on disk (the old reply came on the request's end, before the write finished)
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ url: '/saves/images/' + mapId + '/' + filename }));
            });
        } catch (e) { res.writeHead(500); res.end('{"error":"upload failed"}'); }
        return;
    }

    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch (e) { pathname = url.pathname; }
    if (pathname.includes('..') || pathname.includes('\0')) { res.writeHead(400); return res.end('Bad path'); }
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
        const mimes = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
        res.writeHead(200, Object.assign({ 'Content-Type': mimes[ext] || 'text/plain', 'Cache-Control': 'no-cache, no-store, must-revalidate' }, pathname.startsWith('/saves/') ? { 'Content-Security-Policy': 'sandbox', 'X-Content-Type-Options': 'nosniff' } : {}));
        fs.createReadStream(filePath).pipe(res);
    } else {
        res.writeHead(404); res.end('Not Found');
    }
});

server.listen(port, '127.0.0.1', () => console.log('Waypoint dev server: http://localhost:' + port + '  (saves: ' + savesDir + ')'));
