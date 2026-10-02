/* A classic script in the page's head, directly after /api/prefs.js (which sets window.wpFilePrefs) and before the first module:
   modules run only once the page is parsed, so the file's settings are merged into localStorage before any of them reads one —
   exactly where and when this ran while it was written into the page (the page's policy runs no script written into a page). */
/* Shared preferences (1.1.2): every wp_* setting in localStorage is mirrored to
   saves/preferences.json through the shell, and a newer file wins on launch — so
   settings follow the saves folder instead of one install's browser profile.
   Nothing here runs when the file endpoint is absent (a plain browser client). */
(function() {
    var f = window.wpFilePrefs;
    var stamp = 0; try { stamp = parseInt(localStorage.getItem('wp_prefsStamp'), 10) || 0; } catch (e) {}
    if (f && f.prefs && typeof f.prefs === 'object' && (f.updated || 0) > stamp) {
        try {
            // Identity is never lost to the mirror: the profile (its id is what tokens are owned by) and the table keys
            // (how a returning player proves that id) are kept when the file lacks them, a nameless file profile never
            // blanks a typed name, and table keys from both sides are merged rather than replaced. The same for a GM's signing
            // key (wp_gmSign: a file that lacks it never takes it away) and what a player's app knows of its GMs (wp_gmPins,
            // wp_gmRooms: merged, at most 50 of each).
            var KEEP = { wp_profile: 1, wp_tableKeys: 1, wp_gmSign: 1, wp_gmPins: 1, wp_gmRooms: 1 };
            var local = []; for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf('wp_') === 0 && k !== 'wp_prefsStamp') local.push(k); }
            local.forEach(function(k) { if (!(k in f.prefs) && !KEEP[k]) localStorage.removeItem(k); });
            Object.keys(f.prefs).forEach(function(k) {
                if (k.indexOf('wp_') !== 0) return;
                if (k === 'wp_profile') { try { var fp = JSON.parse(f.prefs[k]), lp = JSON.parse(localStorage.getItem(k) || 'null'); if (fp && typeof fp === 'object') { if (lp && lp.id && !fp.id) fp.id = lp.id; if (lp && lp.name && !fp.name) fp.name = lp.name; localStorage.setItem(k, JSON.stringify(fp)); return; } } catch (e) {} }
                if (k === 'wp_tableKeys') { try { var fk = JSON.parse(f.prefs[k]), lk = JSON.parse(localStorage.getItem(k) || 'null'); if (fk && typeof fk === 'object' && !Array.isArray(fk)) { var mk = Object.assign({}, lk && typeof lk === 'object' ? lk : {}, fk), mks = Object.keys(mk); while (mks.length > 50) delete mk[mks.shift()]; try { localStorage.setItem(k, JSON.stringify(mk)); } catch (e2) {} return; } } catch (e) {} }   // at most 50 (as net.js keeps them), the oldest out; a full store ends this key, not the whole merge
                if (k === 'wp_gmPins' || k === 'wp_gmRooms') { try { var fg = JSON.parse(f.prefs[k]), lg = JSON.parse(localStorage.getItem(k) || 'null'); if (fg && typeof fg === 'object' && !Array.isArray(fg)) { var mg = Object.assign({}, lg && typeof lg === 'object' && !Array.isArray(lg) ? lg : {}, fg), mgs = Object.keys(mg); while (mgs.length > 50) delete mg[mgs.shift()]; try { localStorage.setItem(k, JSON.stringify(mg)); } catch (e2) {} return; } } catch (e) {} }   // the GMs a player's app knows, merged the same way (net.js cleans each entry again as it reads it)
                localStorage.setItem(k, String(f.prefs[k]));
            });
            localStorage.setItem('wp_prefsStamp', String(f.updated));
        } catch (e) {}
    }
    var timer = null;
    function push() {
        timer = null;
        try {
            var prefs = {}; for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf('wp_') === 0 && k !== 'wp_prefsStamp') prefs[k] = localStorage.getItem(k); }
            var updated = Date.now();
            localStorage.setItem('wp_prefsStamp', String(updated));
            return fetch('/api/prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ updated: updated, prefs: prefs }) }).catch(function() {});   // handed back so a caller can wait for the file to be written (Developer mode reloads the page once it is)
        } catch (e) {}
    }
    function schedule() { if (timer) clearTimeout(timer); timer = setTimeout(push, 400); }
    var isPref = function(store, k) { return store === localStorage && typeof k === 'string' && k.indexOf('wp_') === 0 && k !== 'wp_prefsStamp'; };
    var S = Storage.prototype, set = S.setItem, rem = S.removeItem;
    S.setItem = function(k, v) { set.call(this, k, v); if (isPref(this, k)) schedule(); };
    S.removeItem = function(k) { rem.call(this, k); if (isPref(this, k)) schedule(); };
    window.wpPrefsPush = push;
})();
