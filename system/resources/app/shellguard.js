/* The shell's own rules for its windows, kept as plain functions so tools/servercheck.js runs them under Node (main.js is the
   Electron main process and cannot be run there):

   - every window of the app — the main one, the stream window, a pop-out, anything one of them opens — shows the app's own
     pages and nothing else: a link to anywhere else goes to the system browser (http, https and mailto only), and the only
     windows a page may open are the ones the app itself opens (the stream window and the three pop-outs);
   - the app's own address is never handed to the system browser, and never opened as a second full copy of the app;
   - a page is granted only the few permissions the app's own pages use, and only at the app's own address;
   - Developer mode: the browser engine's developer tools open only while the person at this machine has switched it on
     (Settings > Advanced), and the application menu is Waypoint's own;
   - the local server holds both loopback addresses on its port, or moves to the next one (the window loads "localhost",
     which names both);
   - the system browser is sent to this project's own release pages only;
   - the dev server never updates the source tree it runs from;
   - every page of the app is answered with a policy naming what it may run and load: only the app's own files, no script
     written into the page, nothing from another address but the signaling server a table is brokered through.

   Nothing here reads the network. install() takes the electron module as an argument, so a recording stand-in can be given. */
'use strict';
const fs = require('fs');
const path = require('path');

/* ---------- the app's own address ---------- */

function ownOrigin(port) { return 'http://localhost:' + port; }
function parseUrl(u) { if (typeof u !== 'string' || !u || u.length > 8192) return null; try { return new URL(u); } catch (e) { return null; } }
// One of the app's own pages, exactly: its scheme, its name and its port, with no user name in front of them
// (http://localhost.evil.example/, http://localhost:3000@evil.example/ and http://localhost:30001/ are not it).
function isOwn(own, url) { const u = parseUrl(url); return !!u && u.origin === own && !u.username && !u.password; }

// The windows the app itself opens, and no other: the stream window (/?stream=1) and a popped-out page, sheet or chat
// (/?popout=doc:… | sheet:… | chat:…). Any other address of the app — its front page, an API route, a file under saves/, an
// empty ?popout= — would start a second full copy of the app writing the same save, so it opens nothing.
const CHILD_QUERY = /^\?(stream=1|popout=(doc|sheet|chat):[^&#]*)$/;
function childWindowOk(own, url) {
    const u = parseUrl(url);
    return !!u && u.origin === own && !u.username && !u.password && u.pathname === '/' && u.hash === '' && CHILD_QUERY.test(u.search);
}
// What an allowed child window looks like: the main window's look, no menu bar; a pop-out is a reading column, the stream window landscape.
// 1.6.2: a part of a page shown alone (the page's address with /part:<block id> after the item, which docpanel.js popOut writes) is a
// smaller box, so a card or a section stands beside the map and several stand side by side. The address is judged by childWindowOk as
// every pop-out's is; this only picks its size
const PART_QUERY = /^\?popout=doc:[^&#]*\/part:[A-Za-z0-9_-]{1,64}$/;
// 1.6.2: a big table edited in a window of its own (/table:<block id> after the item, docpanel.js popOut) is a big box, 1280 by 860, so a
// table of many columns has room. Only the size: the address is childWindowOk's to judge, as every pop-out's is
const TABLE_QUERY = /^\?popout=doc:[^&#]*\/table:[A-Za-z0-9_-]{1,64}$/;
function childWindowOptions(url, icon) {
    const u = parseUrl(url), portrait = !!u && /^\?popout=/.test(u.search), part = portrait && PART_QUERY.test(u.search), table = portrait && TABLE_QUERY.test(u.search);
    return { autoHideMenuBar: true, icon: icon, width: table ? 1280 : part ? 640 : portrait ? 840 : 1280, height: table ? 860 : part ? 760 : portrait ? 1000 : 720, backgroundColor: '#15151c' };
}

// A link that may go to the system browser: a web page or a mail address, never a file, a program or a custom protocol —
// and never the app's own server under any spelling of this machine's name (the browser would load the whole app there,
// a second copy writing the same save). Returns the address to open, or null.
function loopbackHost(h) {
    h = String(h || '').toLowerCase();
    return h === 'localhost' || h.endsWith('.localhost') || /^127\.\d+\.\d+\.\d+$/.test(h) || h === '0.0.0.0' || h === '[::1]' || h === '[::]' || /^\[::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}\]$/.test(h);
}
function webLinkOk(port, url) {
    const u = parseUrl(url); if (!u) return null;
    if (u.protocol === 'mailto:') return u.href;
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (String(u.port) === String(port) && loopbackHost(u.hostname)) return null;
    return u.href;
}

// The one address the update walk-through may open in the system browser: this project's own release pages on github.com
// (the installer's download link, a release's page, the list). Nothing else on that site, no other host, no port, no user
// name; the path is judged after the URL parser has resolved it. Returns the address to open, or null.
function releaseLink(target, repo) {
    if (typeof target !== 'string' || target.length > 2000 || typeof repo !== 'string' || !repo) return null;
    let u; try { u = new URL(target); } catch (e) { return null; }
    if (u.protocol !== 'https:' || u.hostname !== 'github.com' || u.port || u.username || u.password) return null;
    const base = '/' + repo + '/releases';
    return (u.pathname === base || u.pathname.startsWith(base + '/')) ? u.href : null;
}

/* ---------- permissions ---------- */

// What the app's own pages use, and so all a page is ever granted, at the app's own address only: full screen (a video, the
// stream window), writing to the clipboard (Copy room code), the save-file picker (a large export), and reaching this machine
// and the local network (the page's own server; players on the same network), and the microphone alone for voice chat (permOk).
// Everything else is refused for every address: the camera, the screen, reading the clipboard, the location, notifications,
// opening another program.
const PERMS_ASK = new Set(['fullscreen', 'clipboard-sanitized-write', 'fileSystem', 'local-network', 'local-network-access', 'loopback-network']);
// A check asks nothing of the person and hands nothing over. 'media' is answered yes there, for the app's own address alone,
// because that check is what the engine reads when it gathers a connection's network addresses: the tables connect as they
// always have. Capturing sound or picture is a request, and a request for 'media' is refused unless it is for the microphone alone.
const PERMS_CHECK = new Set(Array.from(PERMS_ASK).concat(['media']));
function permOk(own, perm, url, check, details) {
    if (check !== true && perm === 'media') return micOnly(details) && isOwn(own, url);   // voice chat: the microphone alone, never the camera or the screen
    return typeof perm === 'string' && (check === true ? PERMS_CHECK : PERMS_ASK).has(perm) && isOwn(own, url);
}
// A media request for sound and nothing else (Electron names what is asked for in details.mediaTypes)
function micOnly(details) {
    const t = details && Array.isArray(details.mediaTypes) ? details.mediaTypes : null;
    return !!t && t.length === 1 && t[0] === 'audio';
}

/* ---------- Developer mode ---------- */

// On only when the mirrored settings file says exactly wp_devconsole: 'on' (the page's own switch, Settings > Advanced).
// A missing or unreadable file, or any other value, is off.
function devModeOf(prefsFile) {
    const p = prefsOf(prefsFile);
    return !!p && Object.prototype.hasOwnProperty.call(p, 'wp_devconsole') && p.wp_devconsole === 'on';
}
// The mirrored settings file's prefs, the module's one read of a file: a plain object, or null for a missing, unreadable or odd file
function prefsOf(prefsFile) {
    try {
        const j = JSON.parse(fs.readFileSync(prefsFile, 'utf8'));
        return !!j && typeof j === 'object' && !!j.prefs && typeof j.prefs === 'object' && !Array.isArray(j.prefs) ? j.prefs : null;
    } catch (e) { return null; }
}
// 1.6.2 (backlog 166 c): the text size the page's Settings keeps for this computer (wp_textSize: '90', '110', '125' or '150'), as a zoom factor;
// a missing or unreadable file, or any other value, is 1
function zoomOf(prefsFile) {
    const p = prefsOf(prefsFile), v = p && Object.prototype.hasOwnProperty.call(p, 'wp_textSize') ? p.wp_textSize : null;
    return v === '90' ? 0.9 : v === '110' ? 1.1 : v === '125' ? 1.25 : v === '150' ? 1.5 : 1;
}
// Waypoint's own application menu, in place of the runtime's default one (whose Help entries open the runtime's web pages):
// a short View menu, so Ctrl+R, Ctrl+0 / + / - and F11 keep working, and Developer tools only while Developer mode is on.
function menuTemplate(dev, platform) {
    const view = [
        { role: 'reload', label: 'Reload' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Actual size' },
        { role: 'zoomIn', label: 'Zoom in' },
        { role: 'zoomOut', label: 'Zoom out' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Full screen' }
    ];
    if (dev === true) view.push({ type: 'separator' }, { role: 'toggleDevTools', label: 'Developer tools' });
    const t = [{ label: 'View', submenu: view }];
    if (platform === 'darwin') t.unshift({ role: 'appMenu' }, { role: 'editMenu' });   // there the menu is where Quit, Copy and Paste live
    return t;
}
// The keys that open the developer tools: Ctrl+Shift+I / J / C (Cmd+Alt on a Mac) and F12.
function devToolsKey(input) {
    if (!input || typeof input !== 'object') return false;
    const key = String(input.key || '').toLowerCase(), code = String(input.code || '');
    if (key === 'f12' || code === 'F12') return true;
    const letter = code === 'KeyI' || code === 'KeyJ' || code === 'KeyC' || key === 'i' || key === 'j' || key === 'c';
    return letter && (!!input.control || !!input.meta) && (!!input.shift || !!input.alt);
}

// The right-click menu of a text box (backlog 106; the owner, 2026-10-04: "No right-click Copy / Paste"): the shell shows no
// menu of its own on a right-click, so a field gets Cut, Copy, Paste and Select all here, each only where the field allows it
// (the engine's own editFlags), and selected words that cannot be edited get Copy and Select all. Anywhere else there is no
// menu: the app's own right-click menus call preventDefault on the page's contextmenu, and the engine then asks nothing here.
// params: what the engine says of the right-click (isEditable, selectionText, editFlags). Returns a template of role items,
// or null for no menu. Only true counts as a yes, and nothing that is not a plain object is read.
function editMenuTemplate(params) {
    if (!params || typeof params !== 'object') return null;
    const f = (params.editFlags && typeof params.editFlags === 'object') ? params.editFlags : {};
    const yes = k => f[k] === true;
    const t = [];
    if (params.isEditable === true) {
        if (yes('canCut')) t.push({ role: 'cut', label: 'Cut' });
        if (yes('canCopy')) t.push({ role: 'copy', label: 'Copy' });
        if (yes('canPaste')) t.push({ role: 'paste', label: 'Paste' });
    } else {
        const sel = typeof params.selectionText === 'string' ? params.selectionText : '';
        if (!sel.trim() || !yes('canCopy')) return null;
        t.push({ role: 'copy', label: 'Copy' });
    }
    if (yes('canSelectAll')) { if (t.length) t.push({ type: 'separator' }); t.push({ role: 'selectAll', label: 'Select all' }); }
    return t.length ? t : null;
}

/* ---------- the page's policy ---------- */

// What a page of the app may run and load, sent as a response header with every page by both servers (the main window, the
// stream window and a pop-out are the same page). Script comes from the app's own files only: no script written into the
// page, no handler attribute, no text run as code — so markup that slips past a cleaner stays markup. Styles may be
// written inline (the app sets them everywhere); pictures, sound and video are the app's own files, data: and blob:; fonts
// the app's own; a request goes to the app's own server, to data: and blob:, and to the signaling server a table is
// brokered through (SIGNAL_HOST: the address the bundled connection library dials — the relay and the peers themselves are
// not requests of the page). No frame, no plug-in, no <base>, no form target, no worker, and no page may frame the app.
// Developer mode (the person at this machine switched it on, after a warning) adds one thing and nothing else: text run as
// code, which is what the in-app console does. dev counts only as exactly true.
const SIGNAL_HOST = '0.peerjs.com';
// 1.6.2 (backlog 220; the owner, by prompt: "Yes, after the fonts", switched on "by the website and a settings option"): the app's own signaling
// server, allowed beside the public one so that turning it on needs no new release. Off by default: the app dials it only while the play host's
// /api/version names it (web.signal) or Settings' Own signaling server is ticked. Once it is live a later release names it alone
const SIGNAL_OWN = 'signal.waypointvtt.com';
function pagePolicy(dev) {
    return [
        "default-src 'self'",
        "script-src 'self'" + (dev === true ? " 'unsafe-eval'" : ''),
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "media-src 'self' data: blob:",
        "font-src 'self'",
        "connect-src 'self' data: blob: https://" + SIGNAL_HOST + ' wss://' + SIGNAL_HOST + ' https://' + SIGNAL_OWN + ' wss://' + SIGNAL_OWN,
        "worker-src 'none'",
        "frame-src 'none'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-ancestors 'none'"
    ].join('; ');
}
// The headers one of the app's own files is answered with (never a file under saves/, which has its own): its type is taken
// as stated, never guessed, and a page — an HTML or SVG document — carries the policy, in the mode the mirrored settings
// file says at that moment (devModeOf: anything but exactly "on", or no readable file, is off).
function pageHeaders(mime, prefsFile) {
    const h = { 'X-Content-Type-Options': 'nosniff' };
    if (/^(text\/html|image\/svg\+xml)\s*(;|$)/i.test(String(mime || ''))) h['Content-Security-Policy'] = pagePolicy(devModeOf(prefsFile));
    return h;
}
// A file under saves/ is never answered as a page, a script or a stylesheet, whatever its name: the policy's "own files"
// include that folder, and nothing in it is the app's code (the app writes only pictures, sounds, videos and data there).
function savesType(mime) {
    return /^(text\/html|application\/xhtml\+xml|text\/xml|application\/xml|text\/javascript|application\/javascript|application\/ecmascript|text\/ecmascript|text\/css)\s*(;|$)/i.test(String(mime || '')) ? 'application/octet-stream' : mime;
}

/* ---------- every window ---------- */

// Wire the rules above into Electron. electron: the module (app, session, shell, Menu). opts: { port, prefsFile, icon }.
// Call it once the app is ready and BEFORE the first window is made, so the main window is covered as every later one is.
// Returns { own, devMode(), refresh() }: refresh() reads Developer mode again (after the settings file was written),
// rebuilds the menu when it changed, and closes any open developer tools when it is off.
function install(electron, opts) {
    const app = electron.app, session = electron.session, shell = electron.shell, Menu = electron.Menu;
    const port = opts.port, own = ownOrigin(port), icon = opts.icon;
    const all = new Set();
    let dev = devModeOf(opts.prefsFile), zoom = zoomOf(opts.prefsFile);
    const setZoom = (wc) => { try { let at = String(wc.getURL() || ''); if (at.indexOf('devtools://') !== 0 && !wc.isDestroyed()) wc.setZoomFactor(zoom); } catch (e) { /* gone meanwhile */ } };   // 1.6.2: the text size, on every window of the app's own

    const openWebLink = (url) => { const link = webLinkOk(port, url); if (link) { try { shell.openExternal(link); } catch (e) { /* nothing opened */ } } };
    const urlOf = (details, url) => (details && typeof details.url === 'string' && details.url) || (typeof url === 'string' ? url : '');
    const setMenu = () => { Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate(dev, process.platform))); };
    const closeTools = () => { all.forEach(wc => { try { if (!wc.isDestroyed() && wc.isDevToolsOpened()) wc.closeDevTools(); } catch (e) { /* gone meanwhile */ } }); };

    app.on('web-contents-created', (event, wc) => {
        all.add(wc);
        wc.on('destroyed', () => { all.delete(wc); });
        wc.on('did-finish-load', () => { setZoom(wc); });
        // a new window: one of the app's own, or nothing — a web link goes to the system browser instead
        wc.setWindowOpenHandler((details) => {
            const url = urlOf(details);
            if (childWindowOk(own, url)) return { action: 'allow', overrideBrowserWindowOptions: childWindowOptions(url, icon) };
            if (!isOwn(own, url)) openWebLink(url);
            return { action: 'deny' };
        });
        // a window never leaves the app's own pages (the developer tools' own window, open only in Developer mode, is no page of anyone's and is left to itself)
        wc.on('will-navigate', (details, url) => {
            const to = urlOf(details, url);
            if (isOwn(own, to)) return;
            let at = ''; try { at = String(wc.getURL() || ''); } catch (e) { at = ''; }
            if (dev && at.indexOf('devtools://') === 0) return;
            details.preventDefault(); openWebLink(to);
        });
        wc.on('will-attach-webview', (e) => { e.preventDefault(); });
        // Developer mode off: the keys that open the developer tools do nothing, and tools opened any other way are closed at once
        wc.on('before-input-event', (e, input) => { if (!dev && devToolsKey(input)) e.preventDefault(); });
        wc.on('devtools-opened', () => { if (!dev) { try { wc.closeDevTools(); } catch (e) { /* gone meanwhile */ } } });
        // a right-click in a text box, or on selected words: Cut, Copy, Paste and Select all as the field allows (editMenuTemplate);
        // the developer tools' own window keeps its own menu
        wc.on('context-menu', (e, params) => {
            let at = ''; try { at = String(wc.getURL() || ''); } catch (er) { at = ''; }
            if (at.indexOf('devtools://') === 0) return;
            const t = editMenuTemplate(params);
            if (!t) return;
            try {
                const BW = electron.BrowserWindow, win = BW && typeof BW.fromWebContents === 'function' ? BW.fromWebContents(wc) : null;
                Menu.buildFromTemplate(t).popup(win ? { window: win } : {});
            } catch (er) { /* no menu shown */ }
        });
    });

    session.defaultSession.setPermissionRequestHandler((wc, perm, cb, details) => {
        let from = ''; try { from = (details && details.requestingUrl) || (wc ? wc.getURL() : ''); } catch (e) { from = ''; }
        cb(permOk(own, perm, from, false, details));
    });
    session.defaultSession.setPermissionCheckHandler((wc, perm, origin, details) => {
        let from = ''; try { from = origin || (details && details.requestingUrl) || (wc ? wc.getURL() : ''); } catch (e) { from = ''; }
        return permOk(own, perm, from, true);
    });

    setMenu();
    return {
        own: own,
        devMode: () => dev,
        refresh: () => { const was = dev; dev = devModeOf(opts.prefsFile); if (dev !== was) setMenu(); if (!dev) closeTools(); const z = zoomOf(opts.prefsFile); if (z !== zoom) { zoom = z; all.forEach(setZoom); } return dev; }
    };
}

/* ---------- the local server's address ---------- */

// The window loads http://localhost:<port>, and "localhost" names both loopback addresses (the engine tries [::1] first). So
// the server holds both on one port, or neither: another program on either address of a port means that port is taken, and
// the next one is tried (tries more ports; 0: this port or none). On [::1] only "in use" (or "not permitted") says the port
// is taken; any other failure there (no such address, the family not supported) means this machine has no IPv6 loopback to
// bind, so nobody else is listening there either and 127.0.0.1 alone will do — the app still starts on such a machine.
// s4 answers requests; s6 is a second server handing its requests to the same handler. done(port), or done(0) when
// nothing could be held.
function listenLoopback(s4, s6, port, done, tries) {
    tries = tries === undefined ? 50 : tries;
    const next = () => (tries > 0 ? listenLoopback(s4, s6, port + 1, done, tries - 1) : done(0));
    const attempt = (srv, where, ok, fail) => {
        const onListening = () => { srv.removeListener('error', onError); ok(); };
        const onError = (e) => { srv.removeListener('listening', onListening); fail(e || {}); };
        srv.once('listening', onListening); srv.once('error', onError);
        try { srv.listen(where); } catch (e) { srv.removeListener('listening', onListening); srv.removeListener('error', onError); fail(e || {}); }
    };
    attempt(s4, { port: port, host: '127.0.0.1' }, () => {
        const held = s4.address().port;
        attempt(s6, { port: held, host: '::1', ipv6Only: true }, () => done(held), (e) => {
            if (e.code !== 'EADDRINUSE' && e.code !== 'EACCES') return done(held);   // no IPv6 loopback to bind on this machine
            s4.close(next);                                                         // someone else holds [::1]:port
        });
    }, next);
}

/* ---------- closing the main window while hosting ---------- */

// 1.6.3 (the multiplayer review, finding 11; the owner's pick of 2026-11-21): closing Waypoint while it hosts a table asks first, with three answers
// (Cancel, End the session for everyone, Close and let players wait). The question is the page's own (net.js closeask: window.wpCloseNeed and
// window.wpCloseAsk), asked here as the main window is about to close, so a reload never asks. The page is asked first whether it needs to ask at
// all, and a page that does not answer within needMs (busy, crashed, loading) is not waited on: the window closes as it always did. While the
// question is up a second close does nothing, and a page that reloads or goes away meanwhile lets the next close ask again. The answer 'cancel'
// keeps the window, anything else closes it. A window that is already let go closes at once.
// The review of that finding: the question may be asked by a quit that did not start at the window (a newer launch of Waypoint, app.quit), so the
// window is brought forward first (restored, shown and focused) and the GM is never asked behind another window. opts.onAsk is told when the
// question goes up and opts.onCancel when the GM keeps the window, so that main.js can tell a newer launch to wait or to go (holdWrite below).
function closeGuard(win, opts) {
    opts = opts || {};
    const needMs = opts.needMs || 1500, later = opts.setTimeout || setTimeout;
    const front = () => { try { if (typeof win.isMinimized === 'function' && win.isMinimized() && typeof win.restore === 'function') win.restore(); if (typeof win.show === 'function') win.show(); if (typeof win.focus === 'function') win.focus(); } catch (e) {} };
    const tell = (fn) => { if (typeof fn === 'function') { try { fn(); } catch (e) {} } };
    let asking = false, ok = false, turn = 0;   // turn: which ask an answer belongs to, so a stale one changes nothing
    const wc = win.webContents;
    const reset = () => { asking = false; turn++; };
    if (wc && typeof wc.on === 'function') { wc.on('did-start-loading', reset); wc.on('render-process-gone', reset); }
    const run = (code) => { try { return Promise.resolve(wc.executeJavaScript(code, true)); } catch (e) { return Promise.reject(e); } };
    const within = (p, ms) => Promise.race([p, new Promise(r => later(() => r('slow'), ms))]);
    win.on('close', (e) => {
        if (ok) return;
        e.preventDefault();
        if (asking) return;
        asking = true;
        const my = ++turn;
        within(run("typeof window.wpCloseNeed === 'function' && window.wpCloseNeed() === true"), needMs)
            .then(need => { if (need !== true) return 'close'; front(); tell(opts.onAsk); return run("typeof window.wpCloseAsk === 'function' ? window.wpCloseAsk() : 'close'"); })
            .catch(() => 'close')
            .then(ans => {
                if (!asking || my !== turn) return;   // the page went away meanwhile: the next close asks again
                asking = false;
                if (ans === 'cancel') { tell(opts.onCancel); return; }
                ok = true;
                try { win.close(); } catch (err) {}
            });
    });
    return { asking: () => asking };   // main.js: whether the question is up now (a newer launch then waits for it)
}

/* ---------- a newer launch while this one asks ---------- */

// The newest launch of Waypoint wins: the running one hears 'second-instance' and quits, and the new one waits for the lock (main.js
// waitForInstanceLock). The review of 1.6.3 (finding 11): while hosting, that quit asks the GM first, and a new launch that gave up after eight
// seconds started beside the hosting one on the same saves folder. So the running one leaves a word in a small file of its own beside the lock
// (main.js holdFile, which main.js reads and writes: this module's one read of a file stays prefsOf): 'asking' as the question goes up, 'stay'
// when the GM keeps the window. The new launch reads it at each try (lockNext): a word written after it began counts, an older one is from
// another time and is passed over. Nothing in the file is ever a path or a name.
// holdText: the file's text for a word. holdOf: the word a file's text holds, or null for anything else (no file, junk, another shape).
function holdText(what, now) { return JSON.stringify({ what: what === 'stay' ? 'stay' : 'asking', at: typeof now === 'number' && isFinite(now) ? now : Date.now() }); }
function holdOf(text) {
    try { const h = JSON.parse(String(text)); return h && (h.what === 'asking' || h.what === 'stay') && typeof h.at === 'number' && isFinite(h.at) ? { what: h.what, at: h.at } : null; } catch (e) { return null; }
}
// What the new launch does at a try. hold: holdRead's answer. started: when it began waiting. deadline: when it would have started anyway.
// 'quit': the GM kept the running Waypoint (this launch is not wanted), or has been asked for longer than HOLD_ASK_MS (the running one is alive
// and hosting: never start beside it). 'wait': try again shortly. 'start': before the deadline nothing said, the running one did not answer,
// so start anyway as before.
const HOLD_ASK_MS = 10 * 60 * 1000;
function lockNext(hold, started, now, deadline) {
    const fresh = !!hold && hold.at >= started;
    if (fresh && hold.what === 'stay') return 'quit';
    if (now <= deadline) return 'wait';
    if (fresh && hold.what === 'asking') return now - started <= HOLD_ASK_MS ? 'wait' : 'quit';
    return 'start';
}

/* ---------- the dev server ---------- */

// The folder the dev server's Update and Restore buttons may change: only one named on purpose (WAYPOINT_SYSTEM_DIR) that is
// not the source tree's own system folder under any spelling (another case, a trailing separator, a link back to it).
// Returns its path, or null: the dev server then changes nothing.
function scratchSystemDir(ownSystem, named) {
    if (typeof named !== 'string' || !named.trim()) return null;
    const real = (p) => { try { return fs.realpathSync.native(p); } catch (e) { return path.resolve(p); } };
    const chosen = path.resolve(named);
    return path.relative(real(ownSystem), real(chosen)) === '' ? null : chosen;
}

module.exports = { ownOrigin, isOwn, childWindowOk, childWindowOptions, webLinkOk, releaseLink, PERMS_ASK, PERMS_CHECK, permOk,
    devModeOf, zoomOf, menuTemplate, devToolsKey, editMenuTemplate, SIGNAL_HOST, SIGNAL_OWN, pagePolicy, pageHeaders, savesType, install, listenLoopback, holdText, holdOf, lockNext, HOLD_ASK_MS, scratchSystemDir, closeGuard };
