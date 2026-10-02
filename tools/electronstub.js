/* The shell's main process (system/resources/app/main.js) run under plain Node, for tools/servercheck.js: a recording
   stand-in for the `electron` module, the real main.js loaded over it, then a plan of steps played against what main.js
   wired up — what a window's handlers answer, what a permission is answered, what a request to its local server does — and
   one JSON line of what happened. No window is ever opened and no Electron is started: this is Node and nothing else.

   Usage (as a child process; servercheck starts it):
       node tools/electronstub.js <scratch root> <base port> <plan file>
   <scratch root> stands for an install's folder: main.js keeps its saves in <scratch root>/saves and serves
   <scratch root>/system/app. main.js asks for port 3000 and upwards; here 3000 + k is listened for as <base port> + k, so a
   run never touches the port a real Waypoint uses. Loopback only.

   The plan is a JSON list of steps; "{OWN}" in any string stands for the app's own address (http://localhost:<port>) and
   "{PORT}" for its port:
     { do: 'wc', url }                          a new window's contents (showing url), announced as Electron announces one
     { do: 'url', wc, url }                     the page a window shows is now url
     { do: 'open', wc, url }                    a page there asks for a new window          -> { action, width, height, ext }
     { do: 'nav', wc, url, old }                a page there starts to navigate (old: the address as the second argument only) -> { prevented, ext }
     { do: 'webview', wc }                      a page there attaches a webview             -> { prevented }
     { do: 'key', wc, input }                   a key goes down there                       -> { prevented }
     { do: 'devtools', wc }                     the developer tools open there              -> { open }
     { do: 'ask', wc, perm, url }               a page asks for a permission                -> { granted }
     { do: 'check', wc, perm, origin }          the engine checks a permission              -> { granted }
     { do: 'http', method, path, body, v6 }     a request to the local server (v6: over [::1]) -> { code, text, ext }
     { do: 'state' }                            -> { menus, menu, devOpen, closed }
   wc is a number: 0 is the main window's, each 'wc' step makes the next. ext is what was handed to the system browser by
   that step. */
'use strict';
const Module = require('module'), EventEmitter = require('events'), path = require('path'), fs = require('fs'), http = require('http'), net = require('net');

const root = path.resolve(process.argv[2] || ''), base = parseInt(process.argv[3], 10), planFile = process.argv[4];
if (!process.argv[2] || !(base > 1024) || !planFile) { console.error('usage: node tools/electronstub.js <scratch root> <base port> <plan file>'); process.exit(2); }
const appPath = path.join(root, 'system', 'resources', 'app');
const mainJs = path.join(__dirname, '..', 'system', 'resources', 'app', 'main.js');

const rec = { order: [], ext: [], menus: [], windows: [], loads: [], cookies: [], quit: 0, unknown: [], errors: [] };
const contents = [];
function newContents() {
    const wc = new EventEmitter();
    wc.devOpen = false; wc.closed = 0; wc.url = '';
    wc.setWindowOpenHandler = fn => { wc.openHandler = fn; };
    wc.getURL = () => wc.url;
    wc.isDestroyed = () => false;
    wc.isDevToolsOpened = () => wc.devOpen;
    wc.closeDevTools = () => { wc.devOpen = false; wc.closed++; };
    contents.push(wc);
    return wc;
}
// anything main.js asks of the module that is not written out below is recorded and answered with a resolved promise
const loose = (name, known) => new Proxy(known, { get(t, k) { if (k in t || typeof k === 'symbol') return t[k]; return (...args) => { rec.unknown.push(name + '.' + String(k)); return Promise.resolve(); }; } });

const app = new EventEmitter();
const appOn = app.on.bind(app);
app.on = (name, fn) => { rec.order.push('app.on:' + name); return appOn(name, fn); };
app.getAppPath = () => appPath;
app.setPath = () => {};
app.requestSingleInstanceLock = () => true;
app.releaseSingleInstanceLock = () => {};
app.whenReady = () => Promise.resolve();
app.quit = () => { rec.quit++; };
app.commandLine = { appendSwitch: (...a) => { rec.unknown.push('commandLine.appendSwitch ' + a.join(' ')); } };

class BrowserWindow {
    constructor(opts) {
        rec.order.push('new BrowserWindow'); rec.windows.push(opts);
        this.webContents = newContents();
        app.emit('web-contents-created', {}, this.webContents);   // as Electron does, while the window is being made
    }
    loadURL(u) { rec.order.push('loadURL'); rec.loads.push(u); this.webContents.url = u; return Promise.resolve(); }
}
const electron = {
    app: loose('app', app),
    BrowserWindow,
    shell: loose('shell', { openExternal: u => { rec.ext.push(u); return Promise.resolve(); } }),
    Menu: loose('Menu', {
        buildFromTemplate: t => ({ template: t }),
        setApplicationMenu: m => { rec.order.push('menu'); rec.menus.push(m ? m.template : null); }
    }),
    session: {
        defaultSession: loose('session', {
            setPermissionRequestHandler: fn => { rec.order.push('permission requests'); rec.ask = fn; },
            setPermissionCheckHandler: fn => { rec.order.push('permission checks'); rec.check = fn; },
            cookies: loose('cookies', { set: c => { rec.cookies.push(c); return Promise.resolve(); } })
        })
    }
};
const realLoad = Module._load;
Module._load = function(request) { return request === 'electron' ? electron : realLoad.apply(this, arguments); };

// 3000 + k is listened for as <base> + k (a port given by number or in an options object)
const realListen = net.Server.prototype.listen;
const shift = p => (typeof p === 'number' && p >= 3000 && p < 3100 ? base + (p - 3000) : p);
const bound = new Set();   // the ports this process really holds: a request is only ever sent to one of them
net.Server.prototype.listen = function(a, ...rest) {
    if (a && typeof a === 'object') a = Object.assign({}, a, { port: shift(a.port) }); else a = shift(a);
    this.once('listening', () => { const at = this.address(); if (at && at.port) bound.add(at.port); });
    return realListen.call(this, a, ...rest);
};
const realError = console.error;
console.error = (...a) => { rec.errors.push(a.map(String).join(' ').slice(0, 400)); };

fs.mkdirSync(appPath, { recursive: true });
require(mainJs);

const fill = (v, own, port) => (typeof v === 'string' ? v.split('{OWN}').join(own).split('{PORT}').join(String(port)) : v);
function request(step, port) {
    if (!bound.has(port)) return Promise.resolve({ code: 0, text: 'not a port this process holds' });   // never another program's port (a real Waypoint on 3000)
    return new Promise(resolve => {
        const body = step.body === undefined ? null : Buffer.from(typeof step.body === 'string' ? step.body : JSON.stringify(step.body), 'utf8');
        const headers = Object.assign({ Host: 'localhost:' + port }, step.headers || {});
        if (rec.cookies.length) headers.Cookie = rec.cookies.map(c => c.name + '=' + c.value).join('; ');   // whatever the shell set for its own page goes with a request, as its page's would
        if (body) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = body.length; }
        const rq = http.request({ host: step.v6 ? '::1' : '127.0.0.1', port, method: step.method || 'GET', path: step.path, headers, agent: false }, rs => {
            const bufs = []; rs.on('data', b => bufs.push(b)); rs.on('end', () => resolve({ code: rs.statusCode, text: Buffer.concat(bufs).toString('utf8').slice(0, 400) }));
        });
        rq.on('error', e => resolve({ code: 0, text: String(e && e.code) }));
        rq.setTimeout(8000, () => { const e = new Error('no answer'); e.code = 'ETIMEDOUT'; rq.destroy(e); });
        if (body) rq.write(body);
        rq.end();
    });
}
async function play(plan, port) {
    const own = 'http://localhost:' + port, out = [];
    for (const raw of plan) {
        const step = {}; Object.keys(raw).forEach(k => { step[k] = fill(raw[k], own, port); });
        const wc = contents[step.wc || 0], ext0 = rec.ext.length, ext = () => rec.ext.slice(ext0);
        const ev = () => { const e = { prevented: false, preventDefault() { e.prevented = true; } }; return e; };
        let r = null;
        try {
            if (step.do === 'url') { wc.url = step.url || ''; r = { url: wc.url }; }
            else if (step.do === 'wc') { const w = newContents(); w.url = step.url || ''; app.emit('web-contents-created', {}, w); r = { wc: contents.length - 1 }; }
            else if (step.do === 'open') { const a = wc.openHandler ? wc.openHandler({ url: step.url, frameName: '', features: '', disposition: 'new-window' }) : { action: 'no handler' }; const o = (a && a.overrideBrowserWindowOptions) || {}; r = { action: a && a.action, width: o.width, height: o.height, webPreferences: o.webPreferences, ext: ext() }; }
            else if (step.do === 'nav') { const e = ev(); if (!step.old) e.url = step.url; wc.emit('will-navigate', e, step.url); r = { prevented: e.prevented, listeners: wc.listenerCount('will-navigate'), ext: ext() }; }
            else if (step.do === 'webview') { const e = ev(); wc.emit('will-attach-webview', e, {}, {}); r = { prevented: e.prevented, listeners: wc.listenerCount('will-attach-webview') }; }
            else if (step.do === 'key') { const e = ev(); wc.emit('before-input-event', e, step.input); r = { prevented: e.prevented }; }
            else if (step.do === 'devtools') { wc.devOpen = true; wc.emit('devtools-opened'); r = { open: wc.devOpen }; }
            else if (step.do === 'ask') { let granted = 'no handler'; if (rec.ask) rec.ask(step.wc === null ? null : wc, step.perm, g => { granted = g; }, step.noDetails ? undefined : { requestingUrl: step.url, isMainFrame: true }); r = { granted }; }
            else if (step.do === 'check') { r = { granted: rec.check ? rec.check(step.wc === null ? null : wc, step.perm, step.origin, {}) : 'no handler' }; }
            else if (step.do === 'http') { r = await request(step, port); r.ext = ext(); }
            else if (step.do === 'state') { r = { menus: rec.menus.length, menu: rec.menus[rec.menus.length - 1], devOpen: contents.map(c => c.devOpen), closed: contents.map(c => c.closed) }; }
            else r = { error: 'unknown step' };
        } catch (e) { r = { threw: String(e && e.message || e) }; }
        out.push(r);
    }
    return out;
}

(async () => {
    let plan = []; try { plan = JSON.parse(fs.readFileSync(planFile, 'utf8')); } catch (e) { plan = []; }
    const until = Date.now() + 10000;
    while (!rec.loads.length && !rec.quit && Date.now() < until) await new Promise(r => setTimeout(r, 20));
    const loaded = rec.loads[0] || '', port = parseInt((/:(\d+)$/.exec(loaded) || [])[1], 10) || 0;
    const steps = port ? await play(plan, port) : [];
    console.error = realError;
    process.stdout.write(JSON.stringify({ started: !!port, port, held: bound.has(port), bound: Array.from(bound), loaded, order: rec.order, windows: rec.windows, menus: rec.menus, handlers: contents.map(c => ({ open: typeof c.openHandler === 'function', nav: c.listenerCount('will-navigate'), webview: c.listenerCount('will-attach-webview'), keys: c.listenerCount('before-input-event'), tools: c.listenerCount('devtools-opened') })), ask: typeof rec.ask === 'function', check: typeof rec.check === 'function', quit: rec.quit, unknown: rec.unknown, errors: rec.errors, steps }) + '\n', () => process.exit(0));
})();
