/* releasecheck.js: whether this page is still on the release it started on (1.6.4).
   On Waypoint's website a release is pinned by a cookie that every tab shares. A tab left open while the next release goes out keeps running its
   old code, while anything it loads afterwards comes from the new release. Modules are safe already (every module the page loads later is one it
   loaded at startup). This module closes the rest, with one job: say whether the release changed under this page.
   - check() reads the app folder's version.json again and compares it with the one this page read as it loaded. The callers that read data
     a release ships and then trust it (the starter systems, sysedtabs.js) ask it first and read nothing from a newer release.
   - openerSame() compares this window's version with the main window's, for a window the main window opened (a pop-out or the stream window).
     watch() asks it once the page knows its version and every 30 seconds after, and covers the window with one notice where they differ, since
     the two windows talk over the app's channel and two versions of that talk do not mix.
   On the desktop app and the dev server every file is always the same release, so every answer is "same" and nothing here shows or blocks.
   A read that fails (offline, a setup with no version.json) answers "same": no work is ever blocked on a failed read.
   Loaded by index.html as a module script right after formula.js, well before main.js, so every window and every caller can ask it.
   Imports steplog.js alone.
   Published as window.wpRelease. */
import { stepLog } from './steplog.js';

// [relcheck:core-start]
// Every word this module says, in one place, to go to the owner as a draft. stale: a main window whose release moved (the starters say it);
// opener: a window of its own whose main window runs another release; close: the cover's one button.
// Late reads left as they are, on purpose: sounds.json, the tutorial's pictures, assets/whatsnew.txt and assets/legal.txt. Each is a picture or
// a text shown as it is, never trusted as code or as settings, so a newer release's copy does no harm.
var RELEASE_WORDS = {
    stale: 'Waypoint was updated since this window opened. Reload it to go on.',
    opener: 'Waypoint was updated since the main window opened. Reload the main window, then open this one again.',
    close: 'Close this window'
};
var RELEASE_LOOK_MS = 30000;   // how often a window of its own looks again at the main window's version
var RELEASE_COVER = 'releaseCover';   // the cover's id (esckey.js ESC_ASIDE names it, so Escape never closes it)
// Makes the module's answers for one window. W is the window (or a suite's stand-in): its fetch, document, opener, location, setInterval,
// close, wpVersionReady and wpAppVersion are read. log(step, facts) writes one plain line to the app's log. Answers the published object
function releaseMake(W, log) {
    var said = Object.create(null);   // the changes already written to the log, so one change is one line however often it is found
    var watching = false;
    // The version a version.json answer names, or null: a plain short text, never anything else
    function versionOf(j) { var v = j && typeof j === 'object' ? j.version : null; return (typeof v === 'string' || typeof v === 'number') && String(v).trim() ? String(v).trim().slice(0, 40) : null; }
    // Reads the app folder's version.json once, past every cache. Answers the version, or null where it cannot be read; never rejects
    function readVersion() {
        try {
            if (typeof W.fetch !== 'function') return Promise.resolve(null);
            return Promise.resolve(W.fetch('version.json', { cache: 'no-store' })).then(function(r) { return r && r.ok !== false && typeof r.json === 'function' ? r.json() : null; }).then(versionOf, function() { return null; });
        } catch (e) { return Promise.resolve(null); }
    }
    // One line to the app's log for a change found, with the two versions alone (at: where it was found)
    function note(at, was, now) { var k = at + '|' + was + '|' + now; if (said[k]) return; said[k] = 1; try { log('changed', { at: at, was: was, now: now }); } catch (e) {} }
    var boot = readVersion();   // the version this page started on, read once as the module loads
    // check(): a promise of true where the release is the one this page started on, false where version.json now names another, and true
    // where either read failed. Never rejects
    function check() {
        return boot.then(function(was) {
            if (!was) return true;
            return readVersion().then(function(now) { if (!now || now === was) return true; note('check', was, now); return false; });
        }, function() { return true; });
    }
    // openerSame(): false only where this window was opened by the app's main window and both windows know their versions and they differ;
    // true otherwise (no opener, an opener closed or not readable, a version not known yet)
    function openerSame() {
        var op = null, theirs = null;
        try { op = W.opener; if (!op || op === W || op.closed) return true; theirs = op.wpAppVersion; } catch (e) { return true; }
        var ours = W.wpAppVersion;
        if (typeof theirs !== 'string' || !theirs || typeof ours !== 'string' || !ours) return true;
        if (theirs === ours) return true;
        note('opener', ours, theirs);
        return false;
    }
    // Whether this page is a window of its own the main window opens: a pop-out (?popout=) or the stream window (?stream=1). The main window
    // never shows the cover
    function secondary() {
        try { var q = new URLSearchParams(W.location && typeof W.location.search === 'string' ? W.location.search : ''); return !!q.get('popout') || q.get('stream') === '1'; } catch (e) { return false; }
    }
    function doc() { return W.document || null; }
    function coverEl() { var d = doc(); return d && typeof d.getElementById === 'function' ? d.getElementById(RELEASE_COVER) : null; }
    function coverUp() { return !!coverEl(); }
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
    // Looks once: where the main window runs another release, the cover goes up with its words
    function look() { if (coverUp()) return false; if (openerSame() === false) { coverShow(RELEASE_WORDS.opener); return false; } return true; }
    // watch(): asked by a window of its own as it starts (popout.js, stream.js). Looks once the page knows its version (net.js wpVersionReady,
    // or its wp-version word) and again every 30 seconds, since the main window may be reloaded into a newer release after this one opened.
    // Answers whether it watches: never in the main window, and only once
    function watch() {
        if (!secondary()) return false;
        if (watching) return true; watching = true;
        var ready = W.wpVersionReady;
        Promise.resolve(ready).then(look, look);
        var d = doc(); if (d && typeof d.addEventListener === 'function') d.addEventListener('wp-version', function() { look(); });
        if (typeof W.setInterval === 'function') W.setInterval(look, RELEASE_LOOK_MS);
        return true;
    }
    return { check: check, openerSame: openerSame, watch: watch, look: look, coverShow: coverShow, words: RELEASE_WORDS, boot: function() { return boot; } };
}
// [relcheck:core-end]

if (typeof window !== 'undefined') window.wpRelease = releaseMake(window, function(step, facts) { stepLog('release v1', step, facts); });
export { releaseMake };
