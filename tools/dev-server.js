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

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(200); return res.end(); }

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
            req.on('data', chunk => body += chunk.toString());
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
        req.on('data', c => body += c.toString());
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
            req.on('data', c => body += c.toString());
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
        req.on('data', c => body += c.toString());
        req.on('end', () => { res.writeHead(200); res.end(); });
        return;
    }
    if (url.pathname === '/api/upload-exact' && req.method === 'POST') {
        const rel = decodeURIComponent(url.searchParams.get('path') || '');
        const segs = rel.split('/').filter(Boolean);
        const bad = !segs.length || segs[0] !== 'images' || segs.length < 2 ||
            segs.some(s => s === '.' || s === '..' || s.includes('\\') || s.includes(':'));
        if (bad) { res.writeHead(400); return res.end('bad path'); }
        const savePath = path.join(savesDir, ...segs);
        fs.mkdirSync(path.dirname(savePath), { recursive: true });
        const ws = fs.createWriteStream(savePath);
        req.pipe(ws);
        ws.on('finish', () => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ url: '/saves/' + segs.join('/') }));
        });
        return;
    }
    if (url.pathname === '/api/upload' && req.method === 'POST') {
        const mapId = url.searchParams.get('mapId') || 'unknown';
        const filename = (Math.random().toString(36).substring(2, 10)) + '_' + (url.searchParams.get('filename') || 'image.png');
        const mapDir = path.join(savesDir, 'images', mapId);
        if (!fs.existsSync(mapDir)) fs.mkdirSync(mapDir, { recursive: true });
        const savePath = path.join(mapDir, filename);
        const ws = fs.createWriteStream(savePath);
        req.pipe(ws);
        req.on('end', () => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ url: `/saves/images/${mapId}/${filename}` }));
        });
        return;
    }

    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch (e) { pathname = url.pathname; }
    if (pathname.includes('..')) { res.writeHead(400); return res.end('Bad path'); }
    let filePath;
    if (pathname.startsWith('/saves/')) {
        filePath = path.join(savesDir, pathname.substring(7));
    } else {
        let p = pathname === '/' ? '/index.html' : pathname;
        filePath = path.join(appDir, p);
    }
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const mimes = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
        res.writeHead(200, { 'Content-Type': mimes[ext] || 'text/plain', 'Cache-Control': 'no-cache, no-store, must-revalidate' });
        fs.createReadStream(filePath).pipe(res);
    } else {
        res.writeHead(404); res.end('Not Found');
    }
});

server.listen(port, () => console.log('Waypoint dev server: http://localhost:' + port + '  (saves: ' + savesDir + ')'));
