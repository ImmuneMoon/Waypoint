const { app, BrowserWindow, shell } = require('electron');

// ---- self-update ----
// Releases are published on this public GitHub repository (see tools/release.js). The app
// checks it on launch and from Settings; updates of the front end apply in place, updates
// that need a newer shell fall back to the installer download.
const UPDATE_REPO = 'ImmuneMoon/Waypoint';   // <owner>/<repo> — change here and nowhere else
const updater = require('./updater');
const SHELL_VERSION = require('./package.json').version;
const http = require('http');
const fs = require('fs');
const path = require('path');

const rootDir = path.join(app.getAppPath(), '..', '..', '..');
const savesDir = path.join(rootDir, 'saves');
if (!fs.existsSync(savesDir)) fs.mkdirSync(savesDir);

// Keep the Chromium profile (and the single-instance lock it contains) inside
// this install's folder, so every installed or portable copy of Waypoint is
// fully independent — relaunching only ever replaces THIS copy's instance.
app.setPath('userData', path.join(rootDir, 'system', 'userdata'));

// Newest launch wins: if this copy is already running, the running instance
// receives 'second-instance' when we request its lock, quits, and frees the
// lock and port for us. Instances of other installs hold different locks.
app.on('second-instance', function() { app.quit(); });

function waitForInstanceLock(timeoutMs, cb) {
    const deadline = Date.now() + timeoutMs;
    (function attempt() {
        if (app.requestSingleInstanceLock()) return cb(true);
        if (Date.now() > deadline) return cb(false); // holder unresponsive — start anyway (port fallback covers us)
        app.releaseSingleInstanceLock(); // discard the failed attempt so the next request is fresh
        setTimeout(attempt, 250);
    })();
}

const dataFile = path.join(savesDir, 'data.json');

// Safety net: every launch snapshots the current save into saves/backups/
// (newest 10 kept), so a bad session never costs more than one day's work.
function backupOnLaunch() {
    try {
        if (!fs.existsSync(dataFile) || fs.statSync(dataFile).size < 3) return;
        const bkDir = path.join(savesDir, 'backups');
        if (!fs.existsSync(bkDir)) fs.mkdirSync(bkDir, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
        fs.copyFileSync(dataFile, path.join(bkDir, 'data-' + stamp + '.json'));
        const old = fs.readdirSync(bkDir).filter(f => /^data-.*\.json$/.test(f)).sort().reverse().slice(10);
        old.forEach(f => fs.unlinkSync(path.join(bkDir, f)));
    } catch (e) { /* backups must never block startup */ }
}
backupOnLaunch();

// The version Waypoint reports is the newer of the shell's package.json and system/app/version.json.
// A hot update replaces system/app only, so version.json is what moves the number forward;
// it is read on every request so a freshly swapped app is reported right after its reload.
function appVersion() {
    let v = SHELL_VERSION;
    try {
        const j = JSON.parse(fs.readFileSync(path.join(rootDir, 'system', 'app', 'version.json'), 'utf8'));
        if (j && j.version && updater.cmpVersion(j.version, v) > 0) v = String(j.version);
    } catch (e) { /* no version.json: the shell's own version stands */ }
    return v;
}
const updateCfg = {
    repo: UPDATE_REPO,
    shellVersion: SHELL_VERSION,
    systemDir: path.join(rootDir, 'system'),
};
Object.defineProperty(updateCfg, 'currentVersion', { get: appVersion, enumerable: true });
const updateHandler = updater.makeHandler(updateCfg);

// Only Waypoint's own pages may talk to this server. It listens on localhost with no login and a
// predictable port, so any web page open in the GM's browser could otherwise read /api/data (the whole
// save) or overwrite it with a plain POST. So: no CORS is granted (the renderer and its child windows are
// same-origin and need none), a request carrying an Origin from anywhere else is refused, the browser's
// own Sec-Fetch-Site must say same-origin (or none: a direct navigation), and the Host must be this
// machine's own name (a DNS-rebinding page arrives under its own host name). Tools with no such headers
// (curl, the app's main process) still pass.
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

    if (url.pathname === '/api/update-check' || url.pathname === '/api/update-apply') {
        updateHandler(req, res, url);
        return;
    }
    // Open a release page or installer link in the system browser — GitHub URLs for our repo only
    if (url.pathname === '/api/open-external' && req.method === 'POST') {
        let body = '';
        req.on('data', c => body += c.toString());
        req.on('end', () => {
            let target = null;
            try { target = JSON.parse(body).url; } catch (e) {}
            let okHost = false;   // parsed, not substring-matched: exactly our repo on github.com, or GitHub's own download hosts
            try { const u = new URL(String(target)); okHost = u.protocol === 'https:' && ((u.hostname === 'github.com' && u.pathname.startsWith('/' + UPDATE_REPO + '/')) || u.hostname === 'objects.githubusercontent.com' || u.hostname === 'release-assets.githubusercontent.com'); } catch (e) {}
            if (!okHost) { res.writeHead(400); return res.end('{"error":"not allowed"}'); }
            shell.openExternal(target);
            res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}');
        });
        return;
    }

    if (url.pathname === '/api/ping') {
        res.writeHead(200); return res.end();
    }

    if (url.pathname === '/api/version') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ version: appVersion(), shell: SHELL_VERSION }));
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
            req.on('data', chunk => body += chunk.toString());
            req.on('end', () => {
                // Atomic save: validate, write to a temp file, then rename —
                // a crash mid-write can never leave a truncated data.json.
                try { JSON.parse(body); } catch (e) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    return res.end('{"error":"invalid json"}');
                }
                try {
                    const tmp = dataFile + '.tmp';
                    fs.writeFileSync(tmp, body, 'utf8');
                    fs.renameSync(tmp, dataFile);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end('{"success":true}');
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end('{"error":"write failed"}');
                }
            });
            return;
        }
    }

    if (url.pathname === '/api/list-images' && req.method === 'GET') {
        const imgRoot = path.join(savesDir, 'images');
        const out = [];
        function walk(dir, rel) {
            let names = [];
            try { names = fs.readdirSync(dir); } catch (e) { return; }
            names.forEach(n => {
                const full = path.join(dir, n);
                let st; try { st = fs.statSync(full); } catch (e) { return; }
                if (st.isDirectory()) walk(full, rel + n + '/');
                else if (/\.(png|jpe?g|gif|webp|svg)$/i.test(n)) {
                    out.push({ path: '/saves/images/' + rel + n, folder: rel.replace(/\/$/, ''), name: n, size: st.size, mtime: st.mtimeMs });
                }
            });
        }
        walk(imgRoot, '');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(out));
    }
    if (url.pathname === '/api/log' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            fs.appendFileSync(path.join(savesDir, 'error.log'), new Date().toISOString() + ': ' + body + '\n');
            res.writeHead(200);
            res.end();
        });
        return;
    }
    
    if (url.pathname === '/api/delete-image' && req.method === 'POST') {
        // Delete one picture file under saves/images (the Image Library's Delete picture). The save itself is
        // untouched: anything still referencing the path simply shows a broken picture until re-pointed.
        let body = '';
        req.on('data', c => body += c.toString());
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
        // Import bundles restore images at their exact original paths so the
        // imported items' references still resolve. Restricted to images/.
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
    
    // Serve static files (decode %20 etc. so filenames with spaces resolve)
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch (e) { pathname = url.pathname; }
    if (pathname.includes('..') || pathname.includes('\0')) { res.writeHead(400); return res.end('Bad path'); }
    let filePath, root;
    if (pathname.startsWith('/saves/')) {
        root = savesDir;
        filePath = path.join(root, pathname.substring(7));
    } else {
        let p = pathname === '/' ? '/index.html' : pathname;
        root = path.join(app.getAppPath(), '..', '..', 'app');
        filePath = path.join(root, p);
    }
    // Defence in depth (the renderer's asset gate is the first line): whatever the URL parser made of dot segments or
    // encodings above, the resolved file must sit INSIDE its root (saves/ or the app folder) — anything that escapes is
    // refused, never served.
    root = path.resolve(root); filePath = path.resolve(filePath);
    if (filePath !== root && !filePath.startsWith(root + path.sep)) { res.writeHead(400); return res.end('Bad path'); }
    
    if (fs.existsSync(filePath)) {
        const ext = path.extname(filePath).toLowerCase();
        let mime = 'text/plain';
        if (ext === '.html') mime = 'text/html';
        if (ext === '.js') mime = 'application/javascript';
        if (ext === '.css') mime = 'text/css';
        if (ext === '.png') mime = 'image/png';
        if (ext === '.jpg' || ext === '.jpeg') mime = 'image/jpeg';
        if (ext === '.gif') mime = 'image/gif';
        if (ext === '.svg') mime = 'image/svg+xml';
        if (ext === '.ico') mime = 'image/x-icon';
        
        res.writeHead(200, { 
            'Content-Type': mime,
            ...(pathname.startsWith('/saves/') ? { 'Content-Security-Policy': 'sandbox', 'X-Content-Type-Options': 'nosniff' } : {}),   // a file under saves/ (a picture, a sound, an imported page) is inert if ever opened as a page
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        });
        fs.createReadStream(filePath).pipe(res);
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

let port = 3000;
server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
        port++;
        server.listen(port, '127.0.0.1');
    }
});

waitForInstanceLock(8000, function() {
    server.listen(port, '127.0.0.1', () => {   // loopback only: never reachable from the network (a LAN peer could otherwise forge the Host header)
        app.whenReady().then(() => {
            const win = new BrowserWindow({
                width: 1200,
                height: 800,
                title: "Waypoint",
                autoHideMenuBar: true,
                icon: path.join(__dirname, 'icon.ico')
            });
            // External links (target=_blank, e.g. the About panel) open in the
            // user's default browser instead of a new Electron window.
            const own = `http://localhost:${port}`;   // this app's own origin, exactly (http://localhost.evil.example/ is not it)
            const isOwn = (url) => url === own || url.startsWith(own + '/') || url.startsWith(own + '?') || url.startsWith(own + '#');
            // Only a web link ever reaches the system browser: never file:, a program, or a custom protocol —
            // a link inside content a hostile host sent (a text item, a page, a chat line) must not launch anything here.
            const openWebLink = (url) => { if (/^(https?:|mailto:)/i.test(url)) require('electron').shell.openExternal(url); };
            win.webContents.setWindowOpenHandler(({ url }) => {
                if (isOwn(url)) {
                    // Waypoint's own child windows: same look as the main one, no menu bar. A popped-out doc/sheet
                    // (?popout=) opens PORTRAIT (a reading/reference column for a second monitor); the stream window stays landscape.
                    var portrait = /[?&]popout=/.test(url);
                    return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, icon: path.join(__dirname, 'icon.ico'), width: portrait ? 840 : 1280, height: portrait ? 1000 : 720, backgroundColor: '#15151c' } };
                }
                openWebLink(url);
                return { action: 'deny' };
            });
            // The app window never navigates away from its own pages (a plain link in hostile content would otherwise
            // replace Waypoint with any site): a web link goes to the system browser instead, anything else is dropped.
            win.webContents.on('will-navigate', (e, url) => { if (!isOwn(url)) { e.preventDefault(); openWebLink(url); } });
            win.loadURL(`http://localhost:${port}`);
        });
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

