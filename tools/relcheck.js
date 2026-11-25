/* Offline check of the release check (1.6.4, system/app/scripts/releasecheck.js): whether a page is still on the release it started on.
   On Waypoint's website a release is pinned by a cookie every tab shares, so a tab left open across a release loads the newer release's files
   while it runs its own code. The module's core is run for real on a page of plain objects, with a stand-in fetch, a stand-in opener and a clock
   of the suite's own: check() (the same version, another, a read that fails), openerSame() (no opener, a closed or unreadable one, one of the
   same version or another, by each window's boot read or else their wpAppVersion), watch() (only in a window of its own, at once and every 30
   seconds, a change seen on two looks 5 seconds apart before the cover goes up, its own version.json read where the main window is gone), and the
   cover (elements and text nodes only, its one button closing the window, every key and press stopped but its own, taken down once the windows
   match). Then the places that ask it, run where they can be: the four
   reads of a starter system (sysedtabs.js) read nothing from a newer release, Save HTML (main.js) fetches style.css as before on the same
   release and embeds the loaded sheet only where a newer release is served, and the wiring is pinned (index.html, popout.js, stream.js, esckey.js, campsafe.js, the style
   sheet, Help and both release notes). Usage: node tools/relcheck.js   (exit 1 on any failure) */
'use strict';
require('./srcjoin').install();   // a split giant script reads joined, exactly as it was before the split (tools/srcjoin.js)
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0, summed = false;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail !== undefined ? ' -> ' + String(detail).slice(0, 300) : '')); } }
process.on('exit', function() { if (!summed) { console.log('FAIL      the suite never reached its summary (a check left waiting)'); process.exitCode = 1; } });
const ROOT = path.join(__dirname, '..'), APP = path.join(ROOT, 'system', 'app'), SCRIPTS = path.join(APP, 'scripts');
const read = (f) => fs.readFileSync(path.join(APP, f), 'utf8').replace(/\r\n/g, '\n');
const readRoot = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
function slice(src, name) { const a = src.indexOf('// [' + name + '-start]'), b = src.indexOf('// [' + name + '-end]'); if (a < 0 || b < a) throw new Error('no slice ' + name); return src.slice(a, b); }
const j = JSON.stringify;
const tick = () => new Promise(r => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 24; i++) await tick(); };

/* ---- a page of plain objects ---- */
// Elements and text nodes alone: innerHTML is refused, so a cover made with markup fails here
function makeDoc() {
    const listeners = [];
    function node(tag) {
        const n = { tag: tag, kids: [], attrs: {}, id: '', className: '', parent: null, on: {}, focused: false,
            appendChild(k) { k.parent = n; n.kids.push(k); return k; },
            get parentNode() { return n.parent; },
            removeChild(k) { const i = n.kids.indexOf(k); if (i >= 0) { n.kids.splice(i, 1); k.parent = null; } return k; },
            setAttribute(k, v) { n.attrs[k] = String(v); },
            addEventListener(t, fn) { (n.on[t] = n.on[t] || []).push(fn); },
            contains(x) { for (let p = x; p; p = p.parent) if (p === n) return true; return false; },
            focus() { doc.active = n; },
            querySelector(sel) { const cls = sel.replace(/^\./, ''); let hit = null; walk(n, x => { if (!hit && x !== n && typeof x.className === 'string' && x.className.split(' ').indexOf(cls) >= 0) hit = x; }); return hit; },
            get textContent() { let s = ''; walk(n, x => { if (x.tag === '#text') s += x.data; }); return s; },
            set textContent(v) { n.kids.forEach(k => { k.parent = null; }); n.kids = [{ tag: '#text', data: String(v), kids: [] }]; },
            set innerHTML(v) { doc.markup = true; throw new Error('innerHTML is refused on this page'); } };
        return n;
    }
    function walk(n, fn) { fn(n); (n.kids || []).forEach(k => walk(k, fn)); }
    const doc = { markup: false, active: null, body: null,
        createElement: (t) => node(t),
        createTextNode: (d) => ({ tag: '#text', data: String(d), kids: [] }),
        getElementById(id) { let hit = null; walk(doc.body, x => { if (!hit && x.id === id) hit = x; }); return hit; },
        addEventListener(t, fn) { listeners.push([t, fn]); }, listeners: listeners };
    doc.body = node('body');
    return doc;
}
// A window: its version.json read through fetch (files.version, or a refusal), its address, its opener and its listeners
function makeWin(o) {
    o = o || {};
    const W = { files: { version: o.version === undefined ? '1.6.4' : o.version }, fetched: 0, failRead: false, closed: 0, timers: [], heard: {},
        location: { search: o.search || '' }, opener: o.opener === undefined ? null : o.opener, wpAppVersion: o.app, wpVersionReady: o.ready,
        document: makeDoc(),
        fetch(u, opts) { W.fetched++; W.lastFetch = [u, opts]; if (W.failRead) return Promise.reject(new Error('offline')); const v = W.files.version; return Promise.resolve(v === null ? { ok: false } : { ok: true, json: () => Promise.resolve(typeof v === 'string' ? { version: v } : v) }); },
        setInterval(fn, ms) { W.timers.push([fn, ms]); return W.timers.length; },
        later: [], setTimeout(fn, ms) { W.later.push([fn, ms]); return W.later.length; },
        addEventListener(t, fn, cap) { (W.heard[t] = W.heard[t] || []).push([fn, cap]); },
        close() { W.closed++; } };
    return W;
}
function event(type, target, extra) { const e = Object.assign({ type: type, target: target, stopped: false, prevented: false, cancelable: true, stopImmediatePropagation() { e.stopped = true; }, preventDefault() { e.prevented = true; } }, extra || {}); return e; }
// The suite's own clock for the second look: runs every timer the module asked for (setTimeout), in order, then lets the looks settle.
// Answers the delays the timers were asked for
async function runLater(W) { const run = W.later.splice(0), ms = run.map(t => t[1]); run.forEach(t => t[0]()); await settle(); return ms; }
function fire(W, type, target, extra) { const e = event(type, target, extra); (W.heard[type] || []).forEach(p => p[0](e)); return e; }

(async function() {
    const relSrc = fs.readFileSync(path.join(SCRIPTS, 'releasecheck.js'), 'utf8').replace(/\r\n/g, '\n');
    const core = slice(relSrc, 'relcheck:core');
    const make = (W, log) => new Function('W', 'log', core + '\nreturn releaseMake(W, log);')(W, log);

    /* ---- check() ---- */
    {
        const W = makeWin(), logs = [], R = make(W, (s, f) => logs.push([s, f]));
        const same = await R.check();
        check('check(): the same version.json as at load answers true, read past every cache, and writes nothing to the log', same === true && W.lastFetch[0] === 'version.json' && W.lastFetch[1].cache === 'no-store' && Object.keys(W.lastFetch[1]).every(k => k === 'cache' || k === 'signal') && logs.length === 0, j([same, W.lastFetch, logs]));
        W.files.version = '1.6.5';
        const other = await R.check(), again = await R.check();
        check('check(): another version answers false, and the change is one line of the log with the two versions alone', other === false && again === false && j(logs) === j([['changed', { at: 'check', was: '1.6.4', now: '1.6.5' }]]), j([other, again, logs]));
        W.failRead = true;
        check('check(): a read that fails now answers true, never blocking work', await R.check() === true);
        W.failRead = false; W.files.version = null;
        check('check(): a version.json that is not there answers true', await R.check() === true);
        W.files.version = { version: '' };
        check('check(): a version.json with no version answers true', await R.check() === true);
    }
    {
        const W = makeWin({ version: null }), R = make(W, () => {}); W.files.version = '9.9.9';
        check('check(): a page that could not read its own version as it loaded answers true whatever it reads later', await R.check() === true);
        const W2 = makeWin(); W2.failRead = true; const R2 = make(W2, () => {}); W2.failRead = false; W2.files.version = '9.9.9';
        check('check(): a boot read that failed (offline, a dev setup) answers true', await R2.check() === true);
        const W3 = makeWin(); delete W3.fetch; const R3 = make(W3, () => {});
        check('check(): with no fetch at all it answers true', await R3.check() === true);
    }

    /* ---- openerSame() ---- */
    {
        const logs = [], mk = (o) => { const W = makeWin(o); return [W, make(W, (s, f) => logs.push([s, f]))]; };
        check('openerSame(): no opener answers true', mk({ app: '1.6.4' })[1].openerSame() === true);
        check('openerSame(): an opener of the same version answers true', mk({ app: '1.6.4', opener: { wpAppVersion: '1.6.4' } })[1].openerSame() === true);
        check('openerSame(): an opener of another version answers false, said once to the log', mk({ app: '1.6.5', opener: { wpAppVersion: '1.6.4' } })[1].openerSame() === false && j(logs) === j([['changed', { at: 'opener', was: '1.6.5', now: '1.6.4' }]]), j(logs));
        check('openerSame(): an opener that is closed answers true', mk({ app: '1.6.5', opener: { closed: true, wpAppVersion: '1.6.4' } })[1].openerSame() === true);
        const bad = {}; Object.defineProperty(bad, 'closed', { get() { throw new Error('cross-origin'); } });
        check('openerSame(): an opener that cannot be read answers true', mk({ app: '1.6.5', opener: bad })[1].openerSame() === true);
        check('openerSame(): a version not known yet, on either side, answers true', mk({ app: undefined, opener: { wpAppVersion: '1.6.4' } })[1].openerSame() === true && mk({ app: '1.6.5', opener: { wpAppVersion: null } })[1].openerSame() === true);
        const [Wself, Rself] = mk({ app: '1.6.5' }); Wself.opener = Wself; Wself.wpAppVersion = '1.6.5';
        check('openerSame(): a window that is its own opener answers true', Rself.openerSame() === true);
    }

    /* ---- watch() and the cover ---- */
    {
        // the main window: no query, an opener that differs (a window the app was itself opened from) and no cover whatever happens
        const W = makeWin({ app: '1.6.5', opener: { wpAppVersion: '1.6.4' }, ready: Promise.resolve('1.6.5') }), R = make(W, () => {});
        const ans = R.watch(); await settle();
        check('watch(): the main window never watches and never shows the cover', ans === false && W.timers.length === 0 && W.document.getElementById('releaseCover') === null);
    }
    {
        // a pop-out whose main window runs another release: covered once its version is known
        let readyGo; const ready = new Promise(r => { readyGo = r; });
        const op = { wpAppVersion: '1.6.4' }, W = makeWin({ search: '?popout=sheet:c1/ch1', opener: op, ready: ready }), R = make(W, () => {});
        const ans = R.watch(), twice = R.watch();
        check('watch(): a pop-out watches, once, and looks every 30 seconds', ans === true && twice === true && W.timers.length === 1 && W.timers[0][1] === 30000, j(W.timers.map(t => t[1])));
        await settle();
        check('watch(): nothing is covered before the page knows its version', W.document.getElementById('releaseCover') === null);
        W.wpAppVersion = '1.6.5'; readyGo('1.6.5'); await settle();
        check('the first look that finds another release shows nothing yet and asks for a second look 5 seconds later', W.document.getElementById('releaseCover') === null && j(W.later.map(t => t[1])) === j([5000]), j(W.later.map(t => t[1])));
        await runLater(W);
        const cov = W.document.getElementById('releaseCover');
        check('the cover goes up once the page knows its version and the main window runs another', !!cov && cov.className === 'release-cover' && cov.parent === W.document.body);
        const words = cov && cov.querySelector('release-cover-words'), btn = cov && cov.querySelector('release-cover-close');
        check('the cover says the module\'s own words, as text nodes, with one button that names its act', !!words && words.textContent === R.words.opener && words.kids.every(k => k.tag === '#text') && !!btn && btn.tag === 'button' && btn.type === 'button' && btn.textContent === 'Close this window' && !W.document.markup && cov.attrs.role === 'alertdialog' && cov.attrs['aria-modal'] === 'true', j([words && words.textContent, btn && btn.textContent]));
        check('the cover\'s button has the focus as it comes up', W.document.active === btn);
        btn.on.click.forEach(fn => fn({}));
        check('the cover\'s button closes this window', W.closed === 1);
        // every key and press is the cover's, but for its own button
        const esc = fire(W, 'keydown', W.document.body, { key: 'Escape' }), tab = fire(W, 'keydown', W.document.body, { key: 'Tab' }), ent = fire(W, 'keydown', btn, { key: 'Enter' }), spc = fire(W, 'keyup', btn, { key: ' ' }), letter = fire(W, 'keydown', btn, { key: 'a' });
        check('while the cover is up: Escape is stopped and does nothing, Tab keeps the focus on the button, Enter and the space bar on the button still press it, any other key is stopped', esc.stopped && esc.prevented && tab.stopped && tab.prevented && W.document.active === btn && ent.stopped && !ent.prevented && spc.stopped && !spc.prevented && letter.stopped && letter.prevented, j([esc, tab, ent, spc, letter].map(e => [e.stopped, e.prevented])));
        const clickOff = fire(W, 'click', cov), clickBtn = fire(W, 'click', btn), down = fire(W, 'pointerdown', words), paste = fire(W, 'paste', W.document.body), menu = fire(W, 'contextmenu', cov);
        check('while the cover is up: a press anywhere but its button is stopped, a press on its button is let through', clickOff.stopped && clickOff.prevented && !clickBtn.stopped && !clickBtn.prevented && down.stopped && paste.stopped && menu.stopped && menu.prevented);
        // the cover is kept, never made twice
        R.look(); R.coverShow('again');
        check('a cover already up is kept and never made twice', W.document.body.kids.filter(k => k.id === 'releaseCover').length === 1);
        const heardBy = ['keydown', 'keyup', 'keypress', 'pointerdown', 'mousedown', 'click', 'dblclick', 'contextmenu', 'auxclick', 'paste'].every(t => (W.heard[t] || []).some(p => p[1] === true));
        check('the guard hears every key and press at the window in the capture phase', heardBy);
    }
    {
        // no cover up: the guard lets everything through
        const W = makeWin(), R = make(W, () => {}); void R;
        const e1 = fire(W, 'keydown', W.document.body, { key: 'Escape' }), e2 = fire(W, 'click', W.document.body);
        check('with no cover up the guard stops nothing', !e1.stopped && !e1.prevented && !e2.stopped && !e2.prevented);
    }
    {
        // the stream window, its main window reloaded into a newer release after it opened: the 30 second look finds it
        const op = { wpAppVersion: '1.6.4' }, W = makeWin({ search: '?stream=1', opener: op, app: '1.6.4', ready: Promise.resolve('1.6.4') }), R = make(W, () => {});
        R.watch(); await settle();
        check('the stream window watches, and the same version shows no cover', W.timers.length === 1 && W.document.getElementById('releaseCover') === null);
        W.timers[0][0](); await settle();
        check('a look while nothing changed shows nothing', W.document.getElementById('releaseCover') === null);
        op.wpAppVersion = '1.6.5'; W.timers[0][0](); await settle(); await runLater(W);
        check('the 30 second look covers the window once the main window runs a newer release, saying to close this window and open it again', !!W.document.getElementById('releaseCover') && W.document.getElementById('releaseCover').querySelector('release-cover-words').textContent === R.words.staleAlone);
    }
    {
        // a page that never says its version: the wp-version word is heard too
        const op = { wpAppVersion: '1.6.4' }, W = makeWin({ search: '?popout=chat:', opener: op }), R = make(W, () => {});
        R.watch(); await settle();
        check('with no version promise at hand nothing is covered yet', W.document.getElementById('releaseCover') === null);
        W.wpAppVersion = '1.6.5'; W.document.listeners.filter(p => p[0] === 'wp-version').forEach(p => p[1]()); await settle(); await runLater(W);
        check('the page\'s wp-version word makes it look again', !!W.document.getElementById('releaseCover'));
    }

    /* ---- the review of the release check: a change seen twice, a cover that comes down, a main window that is gone, each window's boot read ---- */
    {
        // finding 1: on the desktop app Update Now and Restore reload a window of its own at once and the main window about 900 ms later
        const op = { wpAppVersion: '1.6.4' }, W = makeWin({ search: '?popout=doc:c1/p1', opener: op, app: '1.6.5', ready: Promise.resolve('1.6.5') }), R = make(W, () => {});
        R.watch(); await settle();
        check('a change the first look finds waits for a second look 5 seconds later, with no cover yet', W.document.getElementById('releaseCover') === null && j(W.later.map(t => t[1])) === j([5000]));
        W.timers[0][0](); await settle();
        check('a further look while the second one waits asks for no other and shows nothing', W.later.length === 1 && W.document.getElementById('releaseCover') === null);
        op.wpAppVersion = '1.6.5';   // the main window reloads onto the same release within the delay
        await runLater(W);
        check('a change that clears within the delay never shows the cover', W.document.getElementById('releaseCover') === null && W.later.length === 0);
        op.wpAppVersion = '1.6.6'; await R.look(); await settle();
        check('a change found again later starts its own wait', W.later.length === 1 && W.document.getElementById('releaseCover') === null);
        await runLater(W);
        const cov = W.document.getElementById('releaseCover');
        check('a change that persists on the second look shows the cover (the main window newer: the words for an old window)', !!cov && cov.querySelector('release-cover-words').textContent === R.words.staleAlone);
        W.timers[0][0](); await settle();
        check('a look while the change stands keeps the one cover up', W.document.body.kids.filter(k => k.id === 'releaseCover').length === 1);
        op.wpAppVersion = '1.6.5'; W.timers[0][0](); await settle();
        check('a cover up comes down once the main window runs the same release again', W.document.getElementById('releaseCover') === null && W.document.body.kids.length === 0);
        const e1 = fire(W, 'keydown', W.document.body, { key: 'Escape' }), e2 = fire(W, 'click', W.document.body);
        check('with the cover down the guards let every key and press through again', !e1.stopped && !e1.prevented && !e2.stopped && !e2.prevented);
        // an older timer from a wait that was cleared does nothing
        op.wpAppVersion = '1.6.6'; await R.look(); await settle();
        const stale = W.later.splice(0); op.wpAppVersion = '1.6.5'; await R.look(); await settle(); op.wpAppVersion = '1.6.6'; await R.look(); await settle();
        stale.forEach(t => t[0]()); await settle();
        check('a timer left from a wait that was cleared puts no cover up', W.document.getElementById('releaseCover') === null && W.later.length === 1);
    }
    {
        // finding 2: a window of its own whose main window was closed reads its own version.json again
        const op = { wpAppVersion: '1.6.4', closed: false }, W = makeWin({ search: '?popout=chat:', opener: op, app: '1.6.4', ready: Promise.resolve('1.6.4') }), R = make(W, () => {});
        R.watch(); await settle();
        const before = W.fetched;
        op.closed = true; W.timers[0][0](); await settle();
        check('with its main window closed, a look reads this window\'s own version.json again, and the same release shows nothing', W.fetched > before && W.later.length === 0 && W.document.getElementById('releaseCover') === null, j([before, W.fetched]));
        W.files.version = '1.6.5'; W.timers[0][0](); await settle();
        check('its own version.json naming another release waits for the second look first', W.document.getElementById('releaseCover') === null && W.later.length === 1);
        await runLater(W);
        const cov = W.document.getElementById('releaseCover');
        check('the second look puts the cover up with the words for a window whose main window is gone', !!cov && cov.querySelector('release-cover-words').textContent === R.words.staleAlone);
        W.files.version = '1.6.4'; W.timers[0][0](); await settle();
        check('the cover comes down where this window\'s release is served again', W.document.getElementById('releaseCover') === null);
        const W2 = makeWin({ search: '?stream=1', opener: null, ready: Promise.resolve('1.6.4') }), R2 = make(W2, () => {});
        R2.watch(); await settle(); W2.files.version = '1.6.5'; W2.timers[0][0](); await settle(); await runLater(W2);
        check('a window of its own with no opener at all does the same', !!W2.document.getElementById('releaseCover') && W2.document.getElementById('releaseCover').querySelector('release-cover-words').textContent === R2.words.staleAlone);
        const W3 = makeWin({ opener: null }), R3 = make(W3, () => {}); await settle(); W3.files.version = '1.6.5';
        const ans3 = await R3.look(); await settle(); await runLater(W3);
        check('the main window never covers itself, whatever its version.json says', ans3 === true && W3.document.getElementById('releaseCover') === null && W3.later.length === 0);
    }
    {
        // finding 3: each window's release is the version it read from its own version.json as it loaded
        const W = makeWin({ version: '1.6.4' }), R = make(W, () => {});
        check('bootNow() is null until the boot read settles', R.bootNow() === null);
        await settle();
        check('bootNow() then answers the version this page read as it loaded', R.bootNow() === '1.6.4');
        W.files.version = '1.6.5'; await R.check();
        check('bootNow() keeps the boot read whatever is served later', R.bootNow() === '1.6.4');
        const Wf = makeWin(); Wf.failRead = true; const Rf = make(Wf, () => {}); await settle();
        check('bootNow() is null where the boot read failed', Rf.bootNow() === null);
        const mk = async (ours, theirBoot, appOurs, appTheirs) => { const op = { wpAppVersion: appTheirs }; if (theirBoot !== undefined) op.wpRelease = { bootNow: () => theirBoot }; const Wx = makeWin({ version: ours, app: appOurs, opener: op }), Rx = make(Wx, () => {}); await settle(); return Rx.openerSame(); };
        check('openerSame(): the two boot reads differing answers false, though both wpAppVersion agree', await mk('1.6.4', '1.6.5', '1.6.5', '1.6.5') === false);
        check('openerSame(): the two boot reads agreeing answers true, though the wpAppVersion differ', await mk('1.6.4', '1.6.4', '1.6.4', '1.6.5') === true);
        check('openerSame(): an opener from before this module (no wpRelease) falls back to the two wpAppVersion', await mk('1.6.4', undefined, '1.6.4', '1.6.5') === false && await mk('1.6.4', undefined, '1.6.5', '1.6.5') === true);
        check('openerSame(): an opener whose boot read is not known falls back to the two wpAppVersion', await mk('1.6.4', null, '1.6.4', '1.6.5') === false && await mk('1.6.4', null, '1.6.4', '1.6.4') === true);
        check('openerSame(): this window\'s boot read failed answers true, whatever the two wpAppVersion say (an older shell\'s version after a hot update)', await mk(null, '1.6.5', '1.6.4', '1.6.4') === true && await mk(null, '1.6.4', '1.6.4', '1.6.5') === true && await mk(null, undefined, '1.6.3', '1.6.4') === true);
        const mkF = async (theirFailed, appOurs, appTheirs) => { const op = { wpAppVersion: appTheirs, wpRelease: { bootNow: () => null, bootFailed: () => theirFailed } }; const Wx = makeWin({ version: '1.6.4', app: appOurs, opener: op }), Rx = make(Wx, () => {}); await settle(); return Rx.openerSame(); };
        check('openerSame(): the main window\'s boot read failed answers true; one still under way falls back to the two wpAppVersion', await mkF(true, '1.6.4', '1.6.3') === true && await mkF(false, '1.6.4', '1.6.3') === false);
        const Wp = makeWin({ version: '1.6.4', app: '1.6.4', opener: { wpAppVersion: '1.6.3' } }), Rp = make(Wp, () => {});
        check('openerSame(): this window\'s boot read still under way falls back to the two wpAppVersion', Rp.bootFailed() === false && Rp.openerSame() === false);
        check('bootFailed(): false while the read is under way and where it found a version, true where it failed', R.bootFailed() === false && Rf.bootFailed() === true);
    }
    {
        // the second review, finding 1, and the third review: a caller never waits more than 4 seconds, and a slow boot read is kept when it lands
        const W = makeWin(); let land = null; W.fetch = (u, o) => { W.fetched++; W.lastFetch = [u, o]; return new Promise(res => { land = res; }); };
        const R = make(W, () => {});
        const t0 = Date.now(), ans = await R.check();
        check('a caller waits at most 4 seconds on the boot read, answering same (true), and a read still under way is not counted as failed', ans === true && R.bootFailed() === false && R.bootNow() === null && Date.now() - t0 >= 3900 && Date.now() - t0 < 6000, Date.now() - t0);
        check('the read\'s time limit is the page\'s own timer, never the window stand-in\'s, so a suite\'s clock of second looks counts no read', W.later.length === 0 && /var RELEASE_READ_MS = 4000;/.test(relSrc));
        const st = await R.checkState();
        check('checkState(): with the boot read still under way past its 4 seconds it says it cannot tell', st.state === 'unknown', j(st));
        land({ ok: true, json: () => Promise.resolve({ version: '1.6.4' }) }); await settle();
        check('the boot read landing late is kept: bootNow() is that version and bootFailed() false', R.bootNow() === '1.6.4' && R.bootFailed() === false);
        W.fetch = (u, o) => { W.fetched++; W.lastFetch = [u, o]; return Promise.resolve({ ok: true, json: () => Promise.resolve({ version: '1.6.5' }) }); };
        const st2 = await R.checkState(), ch2 = await R.check();
        check('once the late boot read has landed the check works: a newer version.json answers changed and check() false', st2.state === 'changed' && st2.was === '1.6.4' && st2.now === '1.6.5' && ch2 === false, j(st2));
        // the fourth review: a boot read under way past its 4 seconds is never compared by wpAppVersion, on this window's side or the main window's
        const Wh = makeWin({ search: '?popout=chat:', app: '1.6.0', opener: { wpAppVersion: '1.6.4', wpRelease: { bootNow: () => '1.6.4', bootFailed: () => false, bootSlow: () => false } }, ready: Promise.resolve('1.6.0') });
        Wh.fetch = () => new Promise(() => {}); const Rh = make(Wh, () => {});
        check('openerSame(): in the boot read\'s first 4 seconds the two wpAppVersion are still compared', Rh.bootSlow() === false && Rh.openerSame() === false);
        await Rh.check();
        check('openerSame(): this window\'s boot read under way past its 4 seconds answers same, never the two wpAppVersion (an older shell\'s version after a hot update)', Rh.bootSlow() === true && Rh.openerSame() === true);
        Rh.watch(); await settle(); Wh.timers[0][0](); await settle(); await runLater(Wh);
        check('and no look covers that window', Wh.document.getElementById('releaseCover') === null);
        const Wo = makeWin({ version: '1.6.4', app: '1.6.4', opener: { wpAppVersion: '1.6.0', wpRelease: { bootNow: () => null, bootFailed: () => false, bootSlow: () => true } } }), Ro = make(Wo, () => {}); await settle();
        check('openerSame(): the main window\'s boot read under way past its 4 seconds answers same, never the two wpAppVersion', Ro.openerSame() === true);
        // a later read that takes too long is aborted, never left open
        let sig = null; W.fetch = (u, o) => { sig = o && o.signal; return new Promise(() => {}); };
        const st3 = await R.checkState();
        check('a later read that takes longer than 4 seconds answers that it cannot tell, and its fetch is aborted', st3.state === 'unknown' && !!sig && sig.aborted === true, j([st3, sig && sig.aborted]));
    }
    {
        // the second review, finding 0: the words follow which side is newer, and a cover already up says the new words where that changes
        const op = { wpAppVersion: '1.6.4' }, W = makeWin({ search: '?popout=doc:c1/p1', opener: op, app: '1.6.5', ready: Promise.resolve('1.6.5') }), R = make(W, () => {});
        R.watch(); await settle(); await runLater(W);
        const words = () => { const c = W.document.getElementById('releaseCover'); return c ? c.querySelector('release-cover-words').textContent : null; };
        check('this window newer than its main window: the cover asks to reload the main window first', words() === R.words.opener);
        op.wpAppVersion = '1.6.6'; W.timers[0][0](); await settle();
        check('the main window reloaded onto a newer release while the cover stood: the same cover now says to close this window and open it again', words() === R.words.staleAlone && W.document.body.kids.filter(k => k.id === 'releaseCover').length === 1);
        op.closed = true; W.files.version = '1.6.6'; W.timers[0][0](); await settle();
        check('the main window closed while the cover stood: the cover follows this window\'s own read', words() === R.words.staleAlone);
        // the third review: a window whose main window runs this module, read by the two windows' boot reads; the words change as the main window
        // is closed, a failed read leaves the cover as it is, and a release taken back says the words that hold either way
        const opB = { wpAppVersion: '1.6.4', wpRelease: { bootNow: () => '1.6.3', bootFailed: () => false } };
        const WB = makeWin({ search: '?popout=chat:', opener: opB, app: '1.6.4', version: '1.6.4', ready: Promise.resolve('1.6.4') }), RB = make(WB, () => {});
        const wordsB = () => { const c = WB.document.getElementById('releaseCover'); return c ? c.querySelector('release-cover-words').textContent : null; };
        RB.watch(); await settle(); WB.timers[0][0](); await settle(); await runLater(WB);   // the first look may come before the boot read has settled, the 30 second look after it
        check('by the two windows\' boot reads, though both wpAppVersion agree: this window newer, the cover asks to reload the main window', wordsB() === RB.words.opener);
        opB.wpRelease.bootFailed = () => true; WB.timers[0][0](); await settle();
        check('the main window\'s own read failed: the look cannot tell, and the cover stays as it is, words and all', wordsB() === RB.words.opener);
        opB.wpRelease.bootFailed = () => false; opB.closed = true; WB.files.version = '1.6.5'; WB.timers[0][0](); await settle();
        check('the main window closed while the cover stood and a newer release served: the words change from the opener words to those for an old window', wordsB() === RB.words.staleAlone);
        WB.failRead = true; WB.timers[0][0](); await settle();
        check('a look whose read fails leaves the cover up with its words', wordsB() === RB.words.staleAlone);
        WB.failRead = false; WB.files.version = '1.6.3'; WB.timers[0][0](); await settle();
        check('a release taken back (version.json older than this window\'s): the words that hold either way, never updated', wordsB() === RB.words.changed);
        WB.files.version = '1.6.4'; WB.timers[0][0](); await settle();
        check('the cover comes down once the release this window started on is served again', wordsB() === null);
        // with no cover yet, a look that cannot tell asks for no second look
        WB.files.version = '1.6.5'; WB.timers[0][0](); await settle();
        const waiting = WB.later.length; WB.failRead = true; await runLater(WB);
        check('a second look whose read fails puts no cover up', waiting === 1 && wordsB() === null);
        WB.failRead = false; WB.timers[0][0](); await settle(); await runLater(WB);
        check('the next look that reads the newer release starts a fresh wait and then covers', wordsB() === RB.words.staleAlone);
        // a main window that can no longer be read (it went to another site) sends the look to this window's own version.json
        const opU = { wpAppVersion: '1.6.4', wpRelease: { bootNow: () => '1.6.3', bootFailed: () => false } };
        const WU = makeWin({ search: '?popout=chat:', opener: opU, app: '1.6.4', version: '1.6.4', ready: Promise.resolve('1.6.4') }), RU = make(WU, () => {});
        const wordsU = () => { const c = WU.document.getElementById('releaseCover'); return c ? c.querySelector('release-cover-words').textContent : null; };
        RU.watch(); await settle(); WU.timers[0][0](); await settle(); await runLater(WU);
        const upU = wordsU() === RU.words.opener;
        Object.defineProperty(opU, 'wpRelease', { get() { throw new Error('another origin'); } });
        WU.timers[0][0](); await settle();
        check('a main window that cannot be read any more: the look reads this window\'s own version.json, and its release served again takes the cover down', upU && wordsU() === null && RU.openerSame() === true);
        WU.files.version = '1.6.5'; WU.timers[0][0](); await settle(); await runLater(WU);
        check('and a newer release served then covers it with the words for an old window', wordsU() === RU.words.staleAlone);
        const op2 = { wpAppVersion: 'beta-2' }, W2 = makeWin({ search: '?stream=1', opener: op2, app: 'beta-1', ready: Promise.resolve('beta-1') }), R2 = make(W2, () => {});
        R2.watch(); await settle(); await runLater(W2);
        check('versions that are not plain numbers: the words that hold whichever is newer', !!W2.document.getElementById('releaseCover') && W2.document.getElementById('releaseCover').querySelector('release-cover-words').textContent === R2.words.differ);
        check('versionCmp(): by number, part by part, null for what is not plain numbers', R.versionCmp('1.6.10', '1.6.9') === 1 && R.versionCmp('1.6.4', '1.6.5') === -1 && R.versionCmp('1.6', '1.6.0') === 0 && R.versionCmp('1.6.4-b', '1.6.4') === null);
    }
    check('the module\'s words: plain sentences, no dash or semicolon, the stale and opener words ask to reload', /^Waypoint was updated since this window opened\. Reload it to go on\.$/.test(make(makeWin(), () => {}).words.stale) && /^Waypoint was updated since the main window opened\. Reload the main window, then open this one again\.$/.test(make(makeWin(), () => {}).words.opener) && /^Waypoint was updated since this window opened\. Close it, then open it again from the main window\.$/.test(make(makeWin(), () => {}).words.staleAlone) && /^This window and the main window run different versions of Waypoint\. Reload the main window, then open this one again\.$/.test(make(makeWin(), () => {}).words.differ) && /^Waypoint changed version since this window opened\. Close it, then open it again from the main window\.$/.test(make(makeWin(), () => {}).words.changed) &&!/[–—;]/.test(j(make(makeWin(), () => {}).words)));
    {
        // found by hand on the merged code: the pop-out's rule hides every child of the body it does not name, and the cover then stood hidden while
        // its guards stopped every key and press. Every rule of style.css that hides children of the body in a window of its own keeps the cover
        const cssRel = fs.readFileSync(path.join(SCRIPTS, '..', 'style.css'), 'utf8');
        const hides = (cssRel.match(/body\.(?:popout-mode|stream-mode|popout-[a-z]+)\s*>\s*\*?:not\([^{]*\{[^}]*display:\s*none/g) || []);
        check('every rule that hides the body\'s children in a pop-out or the stream window keeps the cover (#releaseCover), so it is never hidden while it holds the keys', hides.length >= 1 && hides.every(r => r.includes(':not(#releaseCover)')), JSON.stringify(hides));
    }
    check('the module writes no style and no markup of its own, imports steplog.js alone and publishes window.wpRelease', !/\.style\.|innerHTML|insertAdjacentHTML/.test(relSrc) && (relSrc.match(/^import /gm) || []).length === 1 && relSrc.includes("import { stepLog } from './steplog.js';") && relSrc.includes("window.wpRelease = releaseMake(window, function(step, facts) { stepLog('release v1', step, facts); });"));

    /* ---- the starters (sysedtabs.js): nothing read from a newer release ---- */
    const kit = require('./checkkit');
    {
        const W = { fetched: [], toasts: [], files: {}, same: true };
        const fS = new Function('W', 'var draft = { fields: [] }; var _starterPacks = null; function starterPacksSet(v) { _starterPacks = v; } function toast(t) { W.toasts.push(t); } function renderAll() {} function cleanSystem(j) { return j; } function F() { return null; }\n'
            + 'var window = { wpRelease: { check: function() { return Promise.resolve(W.same); }, words: { stale: "STALE WORDS" } } };\n'
            + 'function fetch(u) { W.fetched.push(u); var b = W.files[u]; return Promise.resolve(b === undefined ? { ok: false } : { ok: true, text: function() { return Promise.resolve(b); }, json: function() { return Promise.resolve(JSON.parse(b)); } }); }\n'
            + kit.cut('sysedtabs.js', '// [systemcheck:starters-start]', '// [systemcheck:starters-end]') + '\nreturn { startersLoad: startersLoad, starterPacksGet: starterPacksGet, starterFetch: starterFetch, starterOf: starterOf };');
        const S = fS(W);
        W.files = { 'assets/systems/starters.json': j({ starters: [{ id: 'tinker', name: 'Tinker', packs: ['tinker/A.wppack.json'] }] }), 'assets/systems/tinker.json': j({ name: 'Tinker', fields: [] }), 'assets/systems/tinker/A.wppack.json': 'A' };
        W.same = false;
        const l0 = await S.startersLoad();
        check('a starter list from a newer release is never read: nothing fetched, no list, the release check\'s words said once', l0 === null && W.fetched.length === 0 && j(W.toasts) === j(['STALE WORDS']), j([l0, W.fetched, W.toasts]));
        W.same = true;
        const l1 = await S.startersLoad();
        check('the same release reads the list exactly as before', Array.isArray(l1) && l1.length === 1 && j(W.fetched) === j(['assets/systems/starters.json']));
        W.same = false; W.fetched = [];
        let pe = null; try { await S.starterPacksGet(S.starterOf('tinker')); } catch (e) { pe = e; }
        check('a starter\'s packs from a newer release: nothing fetched, the read fails with the words on it', !!pe && pe.say === 'STALE WORDS' && W.fetched.length === 0, j([pe && pe.message, W.fetched]));
        let fe = null; try { await S.starterFetch('tinker'); } catch (e) { fe = e; }
        check('a starter\'s system from a newer release: nothing fetched, the read fails with the words on it', !!fe && fe.say === 'STALE WORDS' && W.fetched.length === 0, j([fe && fe.message, W.fetched]));
        W.same = true;
        const got = await S.starterFetch('tinker');
        check('the same release reads a starter and its packs exactly as before', got && got.name === 'Tinker' && j(got.texts) === j(['A']) && j(W.fetched) === j(['assets/systems/tinker.json', 'assets/systems/tinker/A.wppack.json']), j([got, W.fetched]));
        const fN = new Function('W', 'function toast(t) { W.toasts.push(t); } function cleanSystem(j) { return j; } function F() { return null; }\nvar window = {};\nfunction fetch(u) { W.fetched.push(u); return Promise.resolve({ ok: true, json: function() { return Promise.resolve({ starters: [] }); } }); }\n'
            + kit.cut('sysedtabs.js', '// [systemcheck:starters-start]', '// [systemcheck:starters-end]') + '\nreturn { startersLoad: startersLoad };');
        const W2 = { fetched: [], toasts: [] }; await fN(W2).startersLoad();
        check('with no release check at hand (a suite, an older page) the list is read as before', j(W2.fetched) === j(['assets/systems/starters.json']) && W2.toasts.length === 0);
        // Start from, run with its own lines
        const sf = kit.cut('sysedtabs.js', 'function startFrom(id) {', '// [sysedcheck:draftholds-start]');
        const W3 = { fetched: [], toasts: [], same: false, applied: null };
        const fF = new Function('W', 'var draft = { fields: [] }; function draftSet(v) { W.applied = v; draft = v; } function clone(v) { return v; } function hpPoolFill() {} function starterPacksSet() {} function ui() { return {}; } function markDirty() {} function renderAll() {} function toast(t) { W.toasts.push(t); } function emptySystem() { return {}; } function starterOf() { return null; } function cleanSystem(j) { return j; } function F() { return null; } function draftHolds() { return false; } function showConfirm() {} var REPLACE_WORDS = function() { return ""; };\n'
            + 'function starterSame() { return Promise.resolve(W.same); } function starterStale() { var e = new Error("stale"); e.say = "STALE WORDS"; return e; }\n'
            + 'function fetch(u) { W.fetched.push(u); return Promise.resolve({ ok: true, json: function() { return Promise.resolve({ name: "Tinker" }); } }); }\n' + sf + '\nreturn startFrom;');
        const startFrom = fF(W3);
        startFrom('tinker'); await settle();
        check('Start from with a newer release: nothing fetched, nothing applied, the release check\'s words said', W3.fetched.length === 0 && W3.applied === null && j(W3.toasts) === j(['STALE WORDS']), j([W3.fetched, W3.toasts]));
        W3.same = true; W3.toasts = [];
        startFrom('tinker'); await settle();
        check('Start from with the same release reads and applies the preset exactly as before', j(W3.fetched) === j(['assets/systems/tinker.json']) && W3.applied && W3.applied.name === 'Tinker' && /^Starting from Tinker\. Save to keep it\.$/.test(W3.toasts[0]), j([W3.fetched, W3.toasts]));
    }
    {
        const cs = read('scripts/campsafe.js');
        check('New campaign says the release check\'s words where its starter was not read for a newer release, and the step log names it', cs.includes("catch (e) { got = null; why = e && typeof e.say === 'string' ? e.say : ''; }") && cs.includes("log('system-fail', { at: why ? 'starter-stale' : 'starter' }); D.toast(why ? why + ' The campaign has no system yet.' : 'That starter could not be loaded. The campaign has no system yet.');"));
        const asks = kit.familyCount('sheets.js', /starterSame\(\)\.then\(function\(same\) \{/), reads = kit.familyCount('sheets.js', /fetch\('assets\/systems\//);   // over the whole family (splitcheck 7d)
        check('each of the four reads of a starter asks the release check before it fetches (the list, a starter\'s system, its packs, Start from)', asks === 4 && reads === 4, j([asks, reads]));
    }

    /* ---- Save HTML (main.js): the loaded style sheet ---- */
    {
        const mainS = read('scripts/main.js');
        const both = new Function(slice(mainS, 'relcheck:savecss').replace(/^\s*\/\/.*$/gm, '') + '\nreturn { loadedStyleCss: loadedStyleCss, saveStyleCss: saveStyleCss };')();
        const fn = both.loadedStyleCss, save = both.saveStyleCss;
        const fetched = [], fetchFn = (u) => { fetched.push(u); return Promise.resolve({ text: () => Promise.resolve('FETCHED') }); };
        const sheet = (href, rules) => ({ href: href, cssRules: rules.map(r => ({ cssText: r })) });
        const a = await fn({ styleSheets: [sheet('https://fonts.example/x.css', ['nope {}']), sheet('http://localhost:3999/style.css', ['a { color: red; }', 'b { color: blue; }'])] }, fetchFn);
        check('Save HTML embeds the style sheet the page has loaded, its rules joined, and fetches nothing', a === 'a { color: red; }\nb { color: blue; }' && fetched.length === 0, a);
        const b = await fn({ styleSheets: [sheet('http://localhost:3999/style.css?v=2', ['c {}'])] }, fetchFn);
        check('a sheet\'s address with a query still counts', b === 'c {}' && fetched.length === 0);
        const locked = { href: 'http://localhost/style.css' }; Object.defineProperty(locked, 'cssRules', { get() { throw new Error('SecurityError'); } });
        const c = await fn({ styleSheets: [locked] }, fetchFn);
        check('a sheet whose rules cannot be read falls back to the fetch, as before', c === 'FETCHED' && j(fetched) === j(['style.css']));
        const d = await fn({ styleSheets: [sheet('http://localhost/mystyle.css2', ['x {}'])] }, fetchFn), e = await fn({}, fetchFn);
        check('with no such sheet loaded it fetches style.css, as before', d === 'FETCHED' && e === 'FETCHED' && fetched.length === 3);
        // saveStyleCss: the same release fetches style.css exactly as Save HTML did before the release check; only a newer release reads the
        // loaded sheet's rules (the review of the release check, finding 4)
        const FILE = 'input.sheet-range::-moz-range-thumb { -moz-appearance: none; }\n/* a comment */\na { color: red; }\n';
        const fileFetch = [], fileFn = (u) => { fileFetch.push(u); return Promise.resolve({ text: () => Promise.resolve(FILE) }); };
        const loaded = { styleSheets: [sheet('http://localhost:3999/style.css', ['a { color: red; }'])] };
        const rel = (ans) => ({ check: () => ans });
        const s1 = await save(loaded, fileFn, rel(Promise.resolve(true)));
        check('Save HTML on the same release fetches style.css as before and embeds it byte for byte, Firefox-only rules and comments kept', s1 === FILE && j(fileFetch) === j(['style.css']), j([s1, fileFetch]));
        const s2 = await save(loaded, fileFn, rel(Promise.resolve(false)));
        check('Save HTML where a newer release is served embeds the loaded sheet\'s rules and fetches nothing', s2 === 'a { color: red; }' && fileFetch.length === 1, j([s2, fileFetch]));
        const s3 = await save({}, fileFn, rel(Promise.resolve(false)));
        check('a newer release with no loaded sheet that can be read falls back to the fetch', s3 === FILE && fileFetch.length === 2);
        const s4 = await save(loaded, fileFn, null), s5 = await save(loaded, fileFn, rel(Promise.reject(new Error('x')))), s6 = await save(loaded, fileFn, { check() { throw new Error('y'); } });
        check('with no release check, one that fails or one that throws, Save HTML fetches as before', s4 === FILE && s5 === FILE && s6 === FILE && fileFetch.length === 5);
        check('Save HTML asks saveStyleCss with the release check, and style.css is fetched only through it as before', mainS.includes("run(function() { return saveStyleCss(document, fetch, window.wpRelease).then(function(css) {") && (mainS.match(/fetch\('style\.css'\)/g) || []).length === 0 && slice(mainS, 'relcheck:savecss').includes("if (s !== false) return fetchFn('style.css').then(r => r.text());") && slice(mainS, 'relcheck:savecss').includes("fetchFn('style.css')"));
    }

    /* ---- wiring ---- */
    {
        const ix = read('index.html');
        check('index.html loads releasecheck.js as a module script, once, right after formula.js and so before main.js, esckey.js, popout.js and stream.js', ix.split('<script type="module" src="scripts/releasecheck.js"></script>').length === 2 && ix.includes('<script type="module" src="scripts/formula.js"></script>\n<script type="module" src="scripts/releasecheck.js"></script>\n') && ['main.js', 'esckey.js', 'popout.js', 'stream.js'].every(f => ix.indexOf('scripts/releasecheck.js') < ix.indexOf('scripts/' + f + '"></script>')));
        const pop = fs.readFileSync(path.join(SCRIPTS, 'popout.js'), 'latin1'), str = read('scripts/stream.js');
        const line = "if (typeof window.wpRelease === 'object' && window.wpRelease && typeof window.wpRelease.watch === 'function') window.wpRelease.watch();";
        check('a pop-out window asks the opener check as it starts', pop.includes("    window.wpPopout = true;\n    " + line));
        check('the stream window asks the opener check as it starts', str.includes("if (on) {\n    window.wpStream = true;\n    " + line));
        check('popout.js stays LF with no new byte above 127', !/\r\n/.test(pop) && [...pop].filter(ch => ch.charCodeAt(0) > 127).length === 21);
        check('Escape never closes the cover: esckey.js keeps it aside', /var ESC_ASIDE = \[[^\]]*'releaseCover'\]/.test(read('scripts/esckey.js')));
        const css = read('style.css');
        check('the cover is styled by the style sheet with the app\'s color tokens', /#releaseCover \{ position: fixed; inset: 0; z-index: 2147483000;[^}]*background: var\(--overlay\); \}/.test(css) && /#releaseCover \.release-cover-box \{[^}]*background: var\(--panel2\); color: var\(--text\); border: 1px solid var\(--gold\);/.test(css));
        check('Help says it, under joining on the website', ix.includes('<li>On the website, a window you opened from the main window asks you to reload once Waypoint was updated meanwhile.</li>'));
        const notes = ['WHATSNEW.txt', 'system/app/assets/whatsnew.txt'].map(readRoot);
        check('both release notes say it under 1.6.4', notes.every(t => { const a = t.indexOf('A window left open across an update'); return a > 0 && a < t.indexOf('WAYPOINT 1.6.3') && t.includes('the main window now asks you to reload once Waypoint VTT was updated'); }));
        check('CI runs this suite', readRoot('.github/workflows/checks.yml').includes('run: node tools/relcheck.js'));
    }

    summed = true;
    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exitCode = 1;
})().catch(function(e) { console.log('FAIL      ' + (e && e.stack || e)); summed = true; process.exitCode = 1; });
