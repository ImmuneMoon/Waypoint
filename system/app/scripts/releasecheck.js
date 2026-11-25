/* releasecheck.js: whether this page is still on the release it started on (1.6.4).
   On Waypoint's website a release is pinned by a cookie that every tab shares. A tab left open while the next release goes out keeps running its
   old code, while anything it loads afterwards comes from the new release. Modules are safe already (every module the page loads later is one it
   loaded at startup). This module closes the rest, with one job: say whether the release changed under this page.
   - check() reads the app folder's version.json again and compares it with the one this page read as it loaded (its boot read, bootNow()).
     The callers that read data a release ships and then trust it (the starter systems, sysedtabs.js) ask it first and read nothing from a
     newer release.
   - openerSame() compares this window's boot read with the main window's, for a window the main window opened (a pop-out or the stream window).
     Only where a side's boot read is still under way, or the main window is from before this module, are the two windows' wpAppVersion compared
     instead; where either side's read failed it answers "same", since wpAppVersion is not the release a window's files came from.
   - Every read of version.json gives up after 4 seconds and answers as a failed read does, so a read that never settles holds nothing up.
   - watch() looks once the page knows its version and every 30 seconds after. Where the main window that opened this one is still open it asks
     openerSame(); where there is none, or it was closed, it asks check(), since this window still talks over the app's channel to whatever main
     window is open later. A change must be seen twice, on two looks at least 5 seconds apart, before one notice covers the window: on the
     desktop app Update Now and Restore reload a window of its own at once and the main window a moment later, and the two are the same release
     again by then. A cover up comes down again once the two windows match.
   On the desktop app and the dev server every file is always the same release, so every answer is "same" and nothing here shows or blocks.
   A read that fails (offline, a setup with no version.json) answers "same": no work is ever blocked on a failed read.
   Loaded by index.html as a module script right after formula.js, well before main.js, so every window and every caller can ask it.
   Imports steplog.js alone.
   Published as window.wpRelease. */
import { stepLog } from './steplog.js';

// [relcheck:core-start]
// Every word this module says, in one place, to go to the owner as a draft. stale: a main window whose release moved (the starters say it);
// staleAlone: a window of its own that runs an older release than the one now served, its main window gone or newer (the cover says it, and
// its one button closes the window, since a key that would reload it is stopped while the cover is up); opener: a window of its own that runs
// a newer release than the main window that opened it; differ: the two run different releases and which is newer cannot be told; close: the
// cover's one button.
// Late reads left as they are, on purpose: sounds.json, the tutorial's pictures, assets/whatsnew.txt and assets/legal.txt. Each is a picture or
// a text shown as it is, never trusted as code or as settings, so a newer release's copy does no harm.
var RELEASE_WORDS = {
    stale: 'Waypoint was updated since this window opened. Reload it to go on.',
    staleAlone: 'Waypoint was updated since this window opened. Close it, then open it again from the main window.',
    opener: 'Waypoint was updated since the main window opened. Reload the main window, then open this one again.',
    differ: 'This window and the main window run different versions of Waypoint. Reload the main window, then open this one again.',
    close: 'Close this window'
};
var RELEASE_LOOK_MS = 30000;   // how often a window of its own looks again at the main window's version
var RELEASE_CONFIRM_MS = 5000;   // how long after a first look that finds a change the second look is made, before the cover goes up
var RELEASE_READ_MS = 4000;   // how long a read of version.json may take before it counts as failed
var RELEASE_COVER = 'releaseCover';   // the cover's id (esckey.js ESC_ASIDE names it, so Escape never closes it)
// Makes the module's answers for one window. W is the window (or a suite's stand-in): its fetch, document, opener, location, setInterval,
// setTimeout, close, wpVersionReady and wpAppVersion are read. log(step, facts) writes one plain line to the app's log. Answers the published
// object
function releaseMake(W, log) {
    var said = Object.create(null);   // the changes already written to the log, so one change is one line however often it is found
    var watching = false;
    // The version a version.json answer names, or null: a plain short text, never anything else
    function versionOf(j) { var v = j && typeof j === 'object' ? j.version : null; return (typeof v === 'string' || typeof v === 'number') && String(v).trim() ? String(v).trim().slice(0, 40) : null; }
    // Reads the app folder's version.json once, past every cache. Answers the version, or null where it cannot be read or takes longer than
    // RELEASE_READ_MS (the page's own timer, never the window stand-in's, so a suite's clock of second looks counts no read); never rejects
    function readVersion() {
        try {
            if (typeof W.fetch !== 'function') return Promise.resolve(null);
            var read = Promise.resolve(W.fetch('version.json', { cache: 'no-store' })).then(function(r) { return r && r.ok !== false && typeof r.json === 'function' ? r.json() : null; }).then(versionOf, function() { return null; });
            if (typeof setTimeout !== 'function') return read;
            return new Promise(function(done) {
                var t = setTimeout(function() { done(null); }, RELEASE_READ_MS);
                read.then(function(v) { if (typeof clearTimeout === 'function') clearTimeout(t); done(v); });
            });
        } catch (e) { return Promise.resolve(null); }
    }
    // One line to the app's log for a change found, with the two versions alone (at: where it was found)
    function note(at, was, now) { var k = at + '|' + was + '|' + now; if (said[k]) return; said[k] = 1; try { log('changed', { at: at, was: was, now: now }); } catch (e) {} }
    var bootV = null;   // the version this page started on, once its read has settled; null until then and where the read failed
    var bootDone = false;   // whether that read has settled, so a null bootV tells a read under way from one that failed
    var boot = readVersion().then(function(v) { bootV = v; bootDone = true; return v; });   // read once as the module loads
    // bootNow(): the version this page read from its own version.json as it loaded, at once: null until that read settles or where it failed.
    // Another window of the app reads it here (openerSame), since a window's wpAppVersion is the newer of two reads, not the release its files
    // came from
    function bootNow() { return bootV; }
    // bootFailed(): whether the boot read has settled with no version (it failed, or took too long). Another window reads it here too
    function bootFailed() { return bootDone && !bootV; }
    // Which of two versions is newer by their numbers, part by part: 1 where a is newer, -1 where b is, 0 where they read the same, and null
    // where either is not plain numbers and dots
    function versionCmp(a, b) {
        if (!/^\d+(\.\d+)*$/.test(a) || !/^\d+(\.\d+)*$/.test(b)) return null;
        var x = a.split('.'), y = b.split('.');
        for (var i = 0; i < Math.max(x.length, y.length); i++) { var d = (+(x[i] || 0)) - (+(y[i] || 0)); if (d) return d > 0 ? 1 : -1; }
        return 0;
    }
    var lastPair = null;   // the two versions openerSame last found differing: [this window's, the main window's]
    // check(): a promise of true where the release is the one this page started on, false where version.json now names another, and true
    // where either read failed. Never rejects
    function check() {
        return boot.then(function(was) {
            if (!was) return true;
            return readVersion().then(function(now) { if (!now || now === was) return true; note('check', was, now); return false; });
        }, function() { return true; });
    }
    // Whether the window that opened this one is still there: 'none' where there is no opener, it is this window itself or it was closed;
    // 'live' otherwise (an opener that cannot be read counts as live, since nothing can be told about it, and openerSame then answers same)
    function openerState() {
        try { var op = W.opener; if (!op || op === W || op.closed) return 'none'; return 'live'; } catch (e) { return 'live'; }
    }
    // openerSame(): false only where this window was opened by the app's main window, the main window is still open and the two run different
    // releases; true otherwise (no opener, an opener closed or not readable, a version not known yet). Each window's release is the version it
    // read from its own version.json as it loaded (bootNow, the opener's through its own wpRelease). Where either read failed (bootFailed) it
    // answers true: a window's wpAppVersion is the newer of two reads, and on a desktop with an older shell it is the shell's version when the
    // window's own read failed. Only where a read is still under way, or the main window is from before this module (no wpRelease), are the two
    // windows' wpAppVersion compared
    function openerSame() {
        var op = null, theirs = null, theirsBoot = null, theirsFailed = false;
        try {
            op = W.opener; if (!op || op === W || op.closed) return true;
            var rel = op.wpRelease;
            if (rel && typeof rel.bootNow === 'function') { theirsBoot = rel.bootNow(); theirsFailed = typeof rel.bootFailed === 'function' && rel.bootFailed() === true; }
            theirs = op.wpAppVersion;
        } catch (e) { return true; }
        if (bootFailed() || theirsFailed) return true;
        var ours, other;
        if (typeof theirsBoot === 'string' && theirsBoot && typeof bootV === 'string' && bootV) { ours = bootV; other = theirsBoot; }
        else {
            ours = W.wpAppVersion; other = theirs;
            if (typeof other !== 'string' || !other || typeof ours !== 'string' || !ours) return true;
        }
        if (other === ours) return true;
        lastPair = [ours, other];
        note('opener', ours, other);
        return false;
    }
    // The words for windows that differ, by which is newer (lastPair): the main window newer, this window is the old one, and closing it and
    // opening it again from the main window is the cure; this window newer, the main window must be reloaded first; neither told, the words
    // that hold either way
    function openerKind() {
        var c = lastPair ? versionCmp(lastPair[0], lastPair[1]) : null;
        return c === -1 ? 'staleAlone' : c === 1 ? 'opener' : 'differ';
    }
    // Whether this page is a window of its own the main window opens: a pop-out (?popout=) or the stream window (?stream=1). The main window
    // never shows the cover
    function secondary() {
        try { var q = new URLSearchParams(W.location && typeof W.location.search === 'string' ? W.location.search : ''); return !!q.get('popout') || q.get('stream') === '1'; } catch (e) { return false; }
    }
    function doc() { return W.document || null; }
    function coverEl() { var d = doc(); return d && typeof d.getElementById === 'function' ? d.getElementById(RELEASE_COVER) : null; }
    function coverUp() { return !!coverEl(); }
    // Sets the words of a cover already up, where what it says changed (the main window was reloaded or closed while it stood). Answers whether
    // it says them
    function coverWords(words) {
        var c = coverEl(), p = c && typeof c.querySelector === 'function' ? c.querySelector('.release-cover-words') : null; if (!p) return false;
        if (p.textContent === words) return true;
        try { p.textContent = words; return true; } catch (e) { return false; }   // text alone, never markup
    }
    // Puts the cover over the whole window: the words and one button that closes the window, made with elements and text nodes alone and styled
    // by style.css (#releaseCover). Answers the cover; a cover already up is kept
    function coverShow(words) {
        var have = coverEl(); if (have) return have;
        var d = doc(); if (!d || !d.body || typeof d.createElement !== 'function') return null;
        var cov = d.createElement('div'); cov.id = RELEASE_COVER; cov.className = 'release-cover';
        cov.setAttribute('role', 'alertdialog'); cov.setAttribute('aria-modal', 'true'); cov.setAttribute('aria-labelledby', RELEASE_COVER + 'Words');
        var box = d.createElement('div'); box.className = 'release-cover-box';
        var p = d.createElement('p'); p.id = RELEASE_COVER + 'Words'; p.className = 'release-cover-words'; p.appendChild(d.createTextNode(words));
        var foot = d.createElement('div'); foot.className = 'release-cover-foot';
        var b = d.createElement('button'); b.type = 'button'; b.className = 'tool release-cover-close'; b.appendChild(d.createTextNode(RELEASE_WORDS.close));
        b.addEventListener('click', function() { try { W.close(); } catch (e) {} });
        foot.appendChild(b); box.appendChild(p); box.appendChild(foot); cov.appendChild(box); d.body.appendChild(cov);
        try { b.focus(); } catch (e) {}
        return cov;
    }
    // Takes the cover down again, once the two windows match: the element is taken off the page, and the guards below then let every key and
    // press through as before. Answers whether no cover is up now
    function coverHide() {
        var c = coverEl(); if (!c) return true;
        try {
            if (c.parentNode && typeof c.parentNode.removeChild === 'function') c.parentNode.removeChild(c);
            else if (typeof c.remove === 'function') c.remove();
        } catch (e) {}
        return !coverUp();
    }
    function closeBtn() { var c = coverEl(); return c && typeof c.querySelector === 'function' ? c.querySelector('.release-cover-close') : null; }
    // While the cover is up it takes every key and press: heard at the window in the capture phase, before any other listener of the page (this
    // module loads first), and stopped there. Only the cover's own button is let through, so Enter, the space bar and a click still close the
    // window; Tab keeps the focus on that button; Escape does nothing
    function guardKey(e) {
        if (!coverUp()) return;
        var b = closeBtn(), onBtn = !!b && e.target === b;
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        if (e.key === 'Tab') { if (e.preventDefault) e.preventDefault(); try { if (b) b.focus(); } catch (x) {} return; }
        if (!(onBtn && (e.key === 'Enter' || e.key === ' '))) { if (e.preventDefault) e.preventDefault(); }
    }
    function guardPress(e) {
        if (!coverUp()) return;
        var b = closeBtn(); if (b && (e.target === b || (b.contains && b.contains(e.target)))) return;
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        if (e.cancelable !== false && e.preventDefault && e.type !== 'pointerdown' && e.type !== 'mousedown') e.preventDefault();
    }
    if (typeof W.addEventListener === 'function') {
        ['keydown', 'keyup', 'keypress'].forEach(function(t) { W.addEventListener(t, guardKey, true); });
        ['pointerdown', 'mousedown', 'click', 'dblclick', 'contextmenu', 'auxclick', 'paste'].forEach(function(t) { W.addEventListener(t, guardPress, true); });
    }
    // What one look finds: a promise of null where nothing changed, else the key of the words the cover would say. Where the main window that
    // opened this one is still open it is asked (openerSame, at once); where there is none and this is a window of its own, this window's own
    // version.json is read again (check). Never rejects
    function mismatch() {
        try {
            if (openerState() === 'live') return Promise.resolve(openerSame() === false ? openerKind() : null);
            if (!secondary()) return Promise.resolve(null);
            return check().then(function(same) { return same === false ? 'staleAlone' : null; }, function() { return null; });
        } catch (e) { return Promise.resolve(null); }
    }
    var lookQ = Promise.resolve(true);   // the looks run one after another, never two at once
    var pending = false;   // a change was seen once and waits for its second look
    var pendGen = 0;   // which waiting second look counts: raised whenever a look finds nothing, so an older timer does nothing
    // What a look does with what it found. Nothing changed: no second look waits, and a cover up comes down. A change, with no cover up: the
    // first time it is noted and a second look is asked for RELEASE_CONFIRM_MS later (on the window's setTimeout, so a suite drives it on its own
    // clock); the second look (confirming) puts the cover up. With no setTimeout at hand the next look that still finds it confirms it.
    // Answers true where nothing changed
    function lookApply(kind, confirming) {
        if (!kind) { pending = false; pendGen++; coverHide(); return true; }
        if (coverUp()) { coverWords(RELEASE_WORDS[kind] || RELEASE_WORDS.differ); return false; }
        if (confirming || (pending && typeof W.setTimeout !== 'function')) { pending = false; coverShow(RELEASE_WORDS[kind] || RELEASE_WORDS.differ); return false; }
        if (!pending) {
            pending = true;
            var g = ++pendGen;
            if (typeof W.setTimeout === 'function') W.setTimeout(function() { if (g === pendGen && pending) lookOnce(true); }, RELEASE_CONFIRM_MS);
        }
        return false;
    }
    // One look, queued behind any look still under way. Answers a promise of true where nothing changed; never rejects
    function lookOnce(confirming) {
        var run = function() { return mismatch().then(function(kind) { try { return lookApply(kind, confirming); } catch (e) { return true; } }, function() { return true; }); };
        lookQ = lookQ.then(run, run);
        return lookQ;
    }
    // look(): looks once (see lookApply). Asked by watch(), and by a suite
    function look() { return lookOnce(false); }
    // watch(): asked by a window of its own as it starts (popout.js, stream.js). Looks once the page knows its version (net.js wpVersionReady,
    // or its wp-version word) and again every 30 seconds, since the main window may be reloaded into a newer release after this one opened, or
    // closed and opened again on another. Answers whether it watches: never in the main window, and only once
    function watch() {
        if (!secondary()) return false;
        if (watching) return true; watching = true;
        var ready = W.wpVersionReady;
        Promise.resolve(ready).then(function() { look(); }, function() { look(); });
        var d = doc(); if (d && typeof d.addEventListener === 'function') d.addEventListener('wp-version', function() { look(); });
        if (typeof W.setInterval === 'function') W.setInterval(function() { look(); }, RELEASE_LOOK_MS);
        return true;
    }
    return { check: check, openerSame: openerSame, watch: watch, look: look, coverShow: coverShow, words: RELEASE_WORDS, boot: function() { return boot; }, bootNow: bootNow, bootFailed: bootFailed, versionCmp: versionCmp };
}
// [relcheck:core-end]

if (typeof window !== 'undefined') window.wpRelease = releaseMake(window, function(step, facts) { stepLog('release v1', step, facts); });
export { releaseMake };
