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

/* 1.6.2 backlog 235 (the website coordinator, 2026-11-14): what a website's play host says to an import's writes. In a browser it answers
   413 { error: "too-large", max } for a body past its limit, 413 { error: "quota" } past the plan's storage, 429 { error: "daily-upload" }
   past the day's uploads, and 403 for a plan that brings nothing in. The import names each in one plain sentence and keeps a list of what
   landed and what did not, by kind and by count. Only the status and the body's one word are read: never a file's name or content. The
   desktop app never meets these answers and never comes here (main.js asks only on a website's page). */
// [zipcheck:importsay-start]
var IMPORT_WHY = {
    'too-large': 'Too large for the browser: use the desktop app for this file.',
    quota: 'Your storage on the website is full.',
    daily: 'Today’s upload limit is reached, and the rest can come tomorrow.',
    plan: 'Your plan does not let you bring campaigns in.',
    busy: 'The website is busy just now, so try again in a little while.'
};
var WHY_ORDER = ['quota', 'daily', 'plan', 'busy', 'too-large'];
// A refused answer's reason by its status and the body's one word: 'too-large', 'quota', 'daily', 'plan', 'busy' or '' (no reason to name)
function refusalOf(status, body) {
    var e = body && typeof body === 'object' && typeof body.error === 'string' ? body.error : '';
    if (status === 413) return e === 'quota' ? 'quota' : 'too-large';
    if (status === 429) return e === 'daily-upload' ? 'daily' : 'busy';
    if (status === 403) return 'plan';
    return '';
}
// A reason that every later write would meet too: the copy stops at once, the host never asked again
function refusalStops(why) { return why === 'quota' || why === 'daily' || why === 'plan' || why === 'busy'; }
// An answer read: { status, why, max }. A copy of it is read (its caller may still read the answer), and only for the four refusals
function readRefusal(res) {
    var st = res && typeof res.status === 'number' ? res.status : 0;
    if (st !== 403 && st !== 413 && st !== 429) return Promise.resolve({ status: st, why: '', max: 0 });
    var one = function(j) { var m = j && typeof j === 'object' && typeof j.max === 'number' && isFinite(j.max) && j.max > 0 ? Math.floor(j.max) : 0; return { status: st, why: refusalOf(st, j), max: m }; };
    var p; try { p = typeof res.clone === 'function' ? res.clone().json() : typeof res.json === 'function' ? res.json() : Promise.resolve(null); } catch (e) { p = Promise.resolve(null); }
    return Promise.resolve(p).then(one, function() { return one(null); });
}
// What an entry of the archive is, by its place and its ending: 'video', 'sound' or 'picture'
function importKind(name) {
    var n = String(name || '');
    if (/^images\/video\//.test(n)) return 'video';
    if (/\.(mp3|ogg|oga|wav|m4a|flac|opus|aac|weba)$/i.test(n)) return 'sound';
    return 'picture';
}
// Whether an entry that did not land is worth asking for again: not one too large for the browser, nor one damaged in the archive
function tryAgainFor(why) { return why !== 'too-large' && why !== 'damaged'; }
// The list of what landed: kinds 'save' (the campaign itself), 'pack' (a library pack), 'picture', 'sound', 'video'
function importTally() { return { landed: {}, here: 0, left: {}, why: {}, stop: '', max: 0, retry: 0 }; }
function tallyAdd(t, kind, how, why, max) {
    if (how === 'here') { t.here++; return; }
    var m = how === 'landed' ? t.landed : t.left; m[kind] = (m[kind] || 0) + 1;
    if (how === 'left') { var w = why || ''; t.why[w] = (t.why[w] || 0) + 1; if (tryAgainFor(w)) t.retry++; if (max > 0) t.max = max; }
}
var KIND_ORDER = ['save', 'pack', 'picture', 'sound', 'video'], KIND_ONE = { pack: 'library pack', picture: 'picture', sound: 'sound', video: 'video' };
function kindsWords(m) {
    var parts = [];
    KIND_ORDER.forEach(function(k) { var n = m[k] || 0; if (!n) return; parts.push(k === 'save' ? 'the campaign' : n + ' ' + KIND_ONE[k] + (n === 1 ? '' : 's')); });
    return parts.length < 2 ? parts.join('') : parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
}
function tallyLeft(t) { return Object.keys(t.left).reduce(function(s, k) { return s + t.left[k]; }, 0); }
// The import's closing words: what landed, what is still to come, and why, each reason said once
function tallyWords(t) {
    var landed = kindsWords(t.landed), left = kindsWords(t.left), out = [];
    var hereW = t.here ? (t.here === 1 ? '1 file was' : t.here + ' files were') + ' already here' : '';
    if (landed) out.push('Brought in: ' + landed + (hereW ? ', and ' + hereW : '') + '.');
    else if (hereW) out.push((t.here === 1 ? 'The file was' : 'All ' + t.here + ' files were') + ' already here.');
    else if (left) out.push('Nothing was brought in.');
    if (left) out.push((t.stop ? 'Still to come: ' : 'Not brought in: ') + left + '.');
    var ws = WHY_ORDER.filter(function(w) { return t.why[w]; });
    if (t.stop && ws.indexOf(t.stop) > 0) { ws.splice(ws.indexOf(t.stop), 1); ws.unshift(t.stop); }
    ws.forEach(function(w) {
        if (w !== 'too-large') { out.push(IMPORT_WHY[w]); return; }
        out.push('Too large for the browser' + (t.max > 0 ? ' (' + Math.max(1, Math.round(t.max / 1048576)) + ' MB at most)' : '') + ': use the desktop app for ' + (t.why[w] === 1 ? 'this file.' : 'these files.'));
    });
    var other = (t.why[''] || 0) + (t.why.damaged || 0);
    if (other) out.push(other === 1 ? 'One was damaged in the archive or could not be written.' : other + ' were damaged in the archive or could not be written.');
    return out.join(' ');
}
// [zipcheck:importsay-end]
if (typeof window !== 'undefined') window.wpImportSay = { why: refusalOf, stops: refusalStops, again: tryAgainFor, read: readRefusal, kind: importKind, tally: importTally, add: tallyAdd, left: tallyLeft, words: tallyWords };
export { limitOf, limitWords, refusalOf, refusalStops, tryAgainFor, readRefusal, importKind, importTally, tallyAdd, tallyLeft, tallyWords };
