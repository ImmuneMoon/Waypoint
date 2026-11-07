/* A month's downloads used up, said once (1.6.2; the website's limits of 1.0.9, the owner by way of the cloud session, 2026-11-07: "a notice
   for video and sound past the limit ... one notice with the reset time, not one per file"). On a GM's page on the website a picture past
   the limit comes back as a small picture that says so, but a sound or a video comes back as 429 { error: "monthly-download", resetsAt }.
   Sound and music fetch their files and hand a refused answer to wpMediaLimit; a video plays from its element, which never shows a status,
   so the first one that fails is asked for once (limitProbe). Either way one notice is said for each moment the allowance is renewed. */

// [cloudcheck:medialimit-start]
// Whether an answer is the month's downloads used up, and when they start again: { at } or null. Reads the parsed body only
function limitOf(status, body) {
    if (status !== 429 || !body || typeof body !== 'object' || body.error !== 'monthly-download') return null;
    var at = body.resetsAt; return { at: typeof at === 'number' && isFinite(at) && at > 0 && at < 1e14 ? Math.floor(at) : 0 };
}
// The notice's words, the time in this computer's own clock
function limitWords(at) {
    var when = '';
    if (at > 0) { var d = new Date(at); when = ' They start again on ' + d.toLocaleDateString() + ' at ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '.'; }
    return 'This month’s downloads from the website are used up, so sounds and videos do not play.' + when;
}
// [cloudcheck:medialimit-end]

var _said = -1, _probing = 0;
function say(lim) {
    if (!lim || _said === lim.at) return;
    _said = lim.at;
    var t = typeof window !== 'undefined' && (window.appToast || window.wpToast);
    if (typeof t === 'function') t(limitWords(lim.at));
    try { if (typeof window.wpStepLog === 'function') window.wpStepLog('medialimit v1', 'said', { at: lim.at }); } catch (e) {}
}
// A refused answer from a sound's or a song's fetch: read a copy of it, never the answer itself, which its caller still holds
function fromResponse(r) {
    if (!r || r.status !== 429 || typeof r.clone !== 'function') return;
    try { r.clone().json().then(function(j) { say(limitOf(429, j)); }, function() {}); } catch (e) {}
}
// A video or a sound element that failed: on a website's page only, its address asked for once a minute at most
function probe(src) {
    var W = window.wpWebMode; if (!W || typeof W.web !== 'function' || W.web() !== true) return;
    if (typeof src !== 'string' || !/^\/saves\//.test(src.replace(location.origin, '')) || Date.now() - _probing < 60000) return;
    _probing = Date.now();
    fetch(src, { headers: { Range: 'bytes=0-0' }, cache: 'no-store' }).then(function(r) { fromResponse(r); }, function() {});
}
if (typeof document !== 'undefined') {
    document.addEventListener('error', function(e) {
        var el = e.target; if (!el || (el.tagName !== 'VIDEO' && el.tagName !== 'AUDIO' && el.tagName !== 'SOURCE')) return;
        probe(el.currentSrc || el.src || '');
    }, true);
}
if (typeof window !== 'undefined') window.wpMediaLimit = fromResponse;
export { limitOf, limitWords };
