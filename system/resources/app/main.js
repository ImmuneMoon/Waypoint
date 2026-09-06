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

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    if (req.method === 'OPTIONS') { res.writeHead(200); return res.end(); }

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
            const okHost = typeof target === 'string' && /^https:\/\/(github\.com|objects\.githubusercontent\.com|release-assets\.githubusercontent\.com)\//.test(target) && (target.indexOf('github.com/' + UPDATE_REPO + '/') !== -1 || target.indexOf('githubusercontent.com') !== -1);
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
    
    if (url.pathname === '/api/upload-exact' && req.method === 'POST') {
        // Import bundles restore images at their exact original paths so the
        // imported items' references still resolve. Restricted to images/.
        const rel = decodeURIComponent(url.searchParams.get('path') || '');
        const segs = rel.split('/').filter(Boolean);
        const bad = !segs.length || segs[0] !== 'images' || segs.length < 2 ||
            segs.some(s => s === '.' || s === '..' || s.includes('\\') || s.includes(':'));
        if (bad) { res.writeHead(400); res.end('bad path'); return; }
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
        const filename = (Math.random().toString(36).substring(2,10)) + '_' + (url.searchParams.get('filename') || 'image.png');
        
        const mapDir = path.join(savesDir, 'images', mapId);
        if (!fs.existsSync(mapDir)) fs.mkdirSync(mapDir, { recursive: true });
        
        const savePath = path.join(mapDir, filename);
        
        const writeStream = fs.createWriteStream(savePath);
        req.pipe(writeStream);
        
        req.on('end', () => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ url: `/saves/images/${mapId}/${filename}` }));
        });
        return;
    }
    
    // Serve static files (decode %20 etc. so filenames with spaces resolve)
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch (e) { pathname = url.pathname; }
    if (pathname.includes('..')) { res.writeHead(400); return res.end('Bad path'); }
    let filePath;
    if (pathname.startsWith('/saves/')) {
        filePath = path.join(savesDir, pathname.substring(7));
    } else {
        let p = pathname === '/' ? '/index.html' : pathname;
        filePath = path.join(app.getAppPath(), '..', '..', 'app', p);
    }
    
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
        server.listen(port);
    }
});

waitForInstanceLock(8000, function() {
    server.listen(port, () => {
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
            win.webContents.setWindowOpenHandler(({ url }) => {
                if (url.startsWith('http://localhost')) {
                    // Waypoint's own child windows (the stream window): same look as the main one, no menu bar
                    return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, icon: path.join(__dirname, 'icon.ico'), width: 1280, height: 720, backgroundColor: '#15151c' } };
                }
                require('electron').shell.openExternal(url);
                return { action: 'deny' };
            });
            win.loadURL(`http://localhost:${port}`);
        });
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

