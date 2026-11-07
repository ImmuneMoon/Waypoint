/* Waypoint on a website (1.5.5). The owner, 2026-10-23, of a player who reaches a table through the browser before the site takes
   payments: "jut the welcome screen being available for now with an option to join and nothing else but what is needed for the player
   side to work will suffice. no reason to even give them the option of opening anything else", and "they will need to be [trimmed] for
   the subscription tiers to work properly".

   The site serves the signed release as it is, so the app trims itself by what the site says. On a website the play host answers
   GET /api/version with one more key, web: { plan, can }. plan names the account's plan, for display alone. can lists what the plan
   allows, and the app trims by can and never by the plan's name, so a plan may be renamed or priced on the site with no release.
   The desktop shell and the dev server send no web key, and the app is whole there, exactly as before.

   The answer is read ONCE, at the start, before anything is loaded, seeded or saved (io.js load waits for it), and the mode it gives holds
   until the page is loaded again. net.js reads the app's version from the same answer, so the page asks for it once. A read that does not
   come back within WEB_WAIT_MS counts as one that failed. webCaps is the one judge, by the answer and by where the page is served from:
     full        a page of this computer (webLocal: the shell loads http://localhost:<port>, and the shell's server and the dev server
                 listen on the loopback names alone and answer no other), and no web key in the answer, or no answer that reads: a desktop
                 never loses a thing for a fetch that failed
     web         1.6.2: a web key whose can holds campaigns: a GM's page on the website, which serves the shell's own routes from the
                 cloud. The app is whole but for what the site never has (Updates, Developer mode, the saves folder, this install's website
                 account and its cloud saves) and for each word of can the answer lacks (the body's web-no-<word>)
     join-only   any other web key, and every page that is not this computer's whatever its answer says until that answer says web.
                 Without campaigns nothing of the player's own is kept, which is what join-only is; a web key it cannot read, an answer
                 that does not read, an answer that does not come and an answer with no web key are join-only on a website (fail closed).
                 A website's page is join-only from the moment this module runs, before the answer is in
   The words of can, each what it shows (1.6.2 reads them all; campaigns is the word that opens the web mode):
     join        Join a game, and the player's side at a table
     host        Host a table: the Multiplayer window's Host part, the stream window, the relay, the GM's side at a table
     campaigns   campaigns of the account's own kept on the site: Start a campaign, Continue, Enter Waypoint, the Campaign menu,
                 the System editor, the library, the tutorial, and a save of the campaign
     uploads     pictures, sounds, music and videos sent to the site: the Image Library, a picture dropped on the map, Sound, Music and
                 Video uploads, Handouts
     files       Import and Export As: campaigns, maps, pages, characters and systems as files
     backups     snapshots of the saved campaign: Snapshot the save now, the snapshots list and Restore
   Updates, Developer mode and the saves folder never show on a website, whatever can holds: there the deploy is the update.

   The web mode is the body's word web, under which the style sheet puts away what a website never has, and web-no-<word> for each word
   the plan lacks. Join-only is the body's one word web-join (the style sheet puts away what is not the player's, and while the join page is up the whole
   app behind it: main.js wcGate), canPersistLocal answering no for every write (io.js), load bringing the welcome's Join a game up in
   place of a campaign (io.js), the welcome itself (main.js), no stream window (stream.js) and no quick jump (main.js). */

// [servercheck:webcaps-start]
// The words of can this app knows, in the order above. Only join is sent by a site today
export var WEB_CAN = ['join', 'host', 'campaigns', 'uploads', 'files', 'backups'];
// The names a page of this computer is served under, as the address bar writes them: the shell loads http://localhost:<port>, and the
// shell's server and the dev server listen on the loopback addresses alone and refuse any other name (shellguard.listenLoopback, LOCAL_HOSTS)
export var WEB_LOCAL = ['localhost', '127.0.0.1', '[::1]'];
// host: the page's location.hostname, or anything at all. True only for one of WEB_LOCAL's names: a page of this computer
export function webLocal(host) { return typeof host === 'string' && WEB_LOCAL.indexOf(host) >= 0; }
// answer: what GET /api/version answered, parsed, or anything at all. where: { local: true } for a page of this computer (webLocal), and
// anything else for a website's. Reads own keys only and never throws. Answers a fresh { mode, plan, can }: plan a short plain name or '',
// can the words of WEB_CAN it holds, each once, in the order given
export function webCaps(answer, where) {
    var own = function(o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
    var local = false;
    try { local = !!where && typeof where === 'object' && own(where, 'local') && where.local === true; } catch (e) { local = false; }
    var out = { mode: local ? 'full' : 'join-only', plan: '', can: [] };   // with no web key: the full app on this computer, join-only on a website (fail closed)
    try {
        if (!answer || typeof answer !== 'object' || Array.isArray(answer) || !own(answer, 'web')) return out;
    } catch (e) { return out; }   // an answer that cannot even be asked is no answer
    out.mode = 'join-only';   // a web key: join-only unless its can holds campaigns (below)
    try {
        var w = answer.web;
        if (!w || typeof w !== 'object' || Array.isArray(w)) return out;
        if (own(w, 'plan') && typeof w.plan === 'string' && /^[A-Za-z0-9][A-Za-z0-9 _-]{0,39}$/.test(w.plan)) out.plan = w.plan;
        var c = own(w, 'can') ? w.can : null;
        if (Array.isArray(c)) {
            for (var i = 0; i < c.length && i < 64; i++) {
                var v = c[i];
                if (typeof v === 'string' && WEB_CAN.indexOf(v) >= 0 && out.can.indexOf(v) < 0) out.can.push(v);
            }
        }
    } catch (e) { out.plan = ''; out.can = []; }
    if (out.can.indexOf('campaigns') >= 0) out.mode = 'web';   // 1.6.2: a GM's page on the website; without campaigns nothing is kept, so join-only
    return out;
}
// What the web mode lacks, as the body's words: web-no-<word> for each word of WEB_CAN that can does not hold
export function webNoWords(caps) {
    var out = []; if (!caps || caps.mode !== 'web') return out;
    for (var i = 0; i < WEB_CAN.length; i++) if (!Array.isArray(caps.can) || caps.can.indexOf(WEB_CAN[i]) < 0) out.push('web-no-' + WEB_CAN[i]);
    return out;
}
// [servercheck:webcaps-end]

// How long the answer is waited for. Past it the read counts as one that failed: the full app on this computer, join-only on a website
export var WEB_WAIT_MS = 4000;
var _local = false;
try { _local = typeof location !== 'undefined' && !!location && webLocal(location.hostname); } catch (e) { _local = false; }
var _known = null;
function webSettle(answer) {
    if (!_known) {
        _known = webCaps(answer, { local: _local });
        try {
            if (typeof document !== 'undefined' && document.body) {
                var cl = document.body.classList, no = webNoWords(_known);
                cl.toggle('web-join', _known.mode === 'join-only'); cl.toggle('web', _known.mode === 'web');
                for (var i = 0; i < WEB_CAN.length; i++) cl.toggle('web-no-' + WEB_CAN[i], no.indexOf('web-no-' + WEB_CAN[i]) >= 0);
            }
        } catch (e) {}
    }
    return _known;
}
// The one read of the answer, made as this module is first loaded (io.js imports it, so before main.js and net.js run). net.js reads the
// app's version from it too (window.wpWebMode.answer), so the page asks for it once
export var webAnswer = (typeof window !== 'undefined' && typeof fetch === 'function'
    ? fetch('/api/version', { cache: 'no-store' }).then(function(r) { return r.json(); }).catch(function() { return null; })
    : Promise.resolve(null));
export var webReady = new Promise(function(resolve) {
    var t = typeof setTimeout === 'function' ? setTimeout(function() { resolve(webSettle(null)); }, WEB_WAIT_MS) : null;
    webAnswer.then(function(answer) { if (t !== null && typeof clearTimeout === 'function') clearTimeout(t); resolve(webSettle(answer)); });
});
// A website's page is join-only before its answer is in: this release has no other mode for one, so nothing waits on the answer to put the
// GM's parts away or to keep a write from the disk
if (!_local) { try { if (typeof document !== 'undefined' && document.body) document.body.classList.add('web-join'); } catch (e) {} }

if (typeof window !== 'undefined') {
    window.wpWebMode = {
        caps: webCaps,
        CAN: WEB_CAN,
        ready: webReady,
        answer: webAnswer,
        local: function() { return _local; },
        mode: function() { return _known ? _known.mode : _local ? null : 'join-only'; },     // on this computer null until the answer is in
        joinOnly: function() { return _known ? _known.mode === 'join-only' : !_local; },     // on this computer false until the answer is in; a website's page true from the start
        web: function() { return _known ? _known.mode !== 'full' : !_local; },               // 1.6.2: any page of a website, either mode: what a website never has is put away
        has: function(word) { if (!_known) return _local; return _known.mode === 'full' || (_known.mode === 'web' && _known.can.indexOf(word) >= 0); },   // 1.6.2: whether a word of can holds here (the whole app: every word)
        plan: function() { return _known ? _known.plan : ''; },
        can: function() { return _known ? _known.can.slice() : []; }
    };
}
