/* The top row's own menus (1.5.4, backlog 107).
   The owner, 2026-10-06, of the top of the window: "one slim row, with the option of hiding it"; the mock-up was passed "as drawn". A menu of
   the row takes controls out of the row without taking any away: each control keeps its id and its own handler, and is in the page once.

   The CAMPAIGN menu opens from the campaign's name. It lists the campaigns, and holds Search, New, Rename, System and Delete. The list's own
   source is the page's <select id="campaignSelect">, which every other module fills, reads and listens to as it always did: it stays in the
   page, out of sight. A row of the list is an element with a text node, since a campaign's name can come from a file, and a press on a row
   sets the select and says so with a change event, exactly as a pick in the select did. So a session's guard on a campaign switch, and
   everything else that hangs on that event, runs as before.

   The MORE menu opens from the three dots at the row's right end. It holds Export As, with its kinds in a list beside it, Import, Refresh,
   About and the way back to the welcome screen.

   The TRAY (1.6.0; the owner, by prompt: "A » where they were", and "hiding one at a time as needed is preferable"): in a narrow window the row's
   icons step out one at a time, the least used first (FOLD_ORDER: Help, Handouts, Sound, Music, Journal, Voice last), only as many as keep
   the row on one line. A » button after the Journal takes their place, with how many stepped out, and opens a tray that holds a button for
   each, which presses the control itself: the control stays in the page with its id and its handler, only out of sight.

   A list could be worked from the keyboard, so a menu can be too, with the keys the page's Outline menu has: Down on its button opens it, the
   arrow keys, Home and End go through its rows, a letter goes to the next row that begins with it, Enter presses the row that has the focus,
   and Escape puts the menu away. */
// [lookcheck:toprow-start]
var MENUS = ['campMenu', 'moreMenu', 'notesMenu', 'rowTray'];   // every menu of the row, by its id. Its button is the one whose aria-controls names it. notesMenu: the bell's (notices.js, 1.5.5)
var ONE_ROW = 48;   // the row is 36 high while one line holds its controls, and 60 or more once it wraps: this stands between the two
function menuBtn(id) { return document.querySelector('[aria-controls="' + id + '"]'); }
function menuShown(id) { var m = document.getElementById(id); return !!m && m.hidden !== true; }
function menuSet(id, show) {
    var m = document.getElementById(id), b = menuBtn(id); if (!m) return false;
    m.hidden = show !== true; if (b) b.setAttribute('aria-expanded', show === true ? 'true' : 'false');
    if (show !== true) Array.prototype.forEach.call(m.querySelectorAll('.header-dropdown'), function(d) { d.style.display = 'none'; });   // a list that stood beside the menu goes with it
    return true;
}
function closeMenus(but) { var any = false; MENUS.forEach(function(id) { if (id !== but && menuShown(id)) { menuSet(id, false); any = true; } }); return any; }
function openMenu(id) {   // one menu of the row is up at a time
    if (MENUS.indexOf(id) < 0) return false;
    closeMenus(id); if (id === 'campMenu') campDraw(); if (id === 'rowTray') { foldSync(); markSync(); } if (id === 'notesMenu' && window.wpNotices && typeof window.wpNotices.draw === 'function') window.wpNotices.draw();
    return menuSet(id, true);
}
// A menu's rows are its buttons that are on screen, in the order they stand in: a row that is hidden takes no key and no focus
function menuRows(id) { var m = document.getElementById(id); return m ? Array.prototype.slice.call(m.querySelectorAll('button')).filter(function(r) { return r.offsetParent !== null; }) : []; }
// The keys of a menu: Down and Up go round its rows, Home and End to the first and the last. at: the row that has the focus, n: how many
// rows there are. Answers the row to go to, or -1 where the key is not the menu's
// 1.6.0 (the sweep of 2026-10-17, seen live: End inside Export As's kinds went to More's last row): Home and End from a row that stands in a
// list beside the menu go to that list's first and last row. subs: for each row, the list it stands in, or null. -1 where the row is in none
function menuSubEnd(key, at, subs) {
    if ((key !== 'Home' && key !== 'End') || !Array.isArray(subs) || !(at >= 0 && at < subs.length) || !subs[at]) return -1;
    var s = subs[at], first = -1, last = -1; for (var i = 0; i < subs.length; i++) if (subs[i] === s) { if (first < 0) first = i; last = i; }
    return key === 'Home' ? first : last;
}
function menuStep(key, at, n) {
    if (!(n > 0)) return -1;
    if (!(at >= 0 && at < n)) at = -1;   // no row has the focus
    if (key === 'ArrowDown') return at === n - 1 ? 0 : at + 1;
    if (key === 'ArrowUp') return at <= 0 ? n - 1 : at - 1;
    if (key === 'Home') return 0;
    if (key === 'End') return n - 1;
    return -1;
}
// A typed letter goes to the next row whose words begin with it, as it did in a list, and round to the first again. names: the rows' words.
// Answers the row to go to, or -1 where no row begins with it
function menuType(names, at, ch) {
    var n = names.length, c = String(ch).toLowerCase(), from = at >= 0 && at < n ? at : -1;
    for (var k = 1; k <= n; k++) { var i = (from + k) % n; if (String(names[i]).replace(/^\s+/, '').toLowerCase().indexOf(c) === 0) return i; }
    return -1;
}
// Opened from the keyboard, a menu takes the focus: the row that is on, as a list does, else its first row. true: a row took it
function menuFocus(id) {
    var rows = menuRows(id), to = rows.filter(function(r) { return /(^| )on( |$)/.test(r.className); })[0] || rows[0];
    if (to) to.focus();
    return !!to;
}
// The campaigns as the select holds them: [{ id, name, on }], the one on screen marked
function campRows(sel) {
    var out = [], opts = sel && sel.options ? sel.options : [];
    for (var i = 0; i < opts.length; i++) { var o = opts[i]; out.push({ id: o.value, name: o.textContent || 'Unnamed Campaign', on: o.value === sel.value }); }
    return out;
}
function campName(sel) { var on = campRows(sel).filter(function(r) { return r.on; })[0]; return on ? on.name : 'Campaign'; }
// The list in the menu: one button a campaign, its name a text node. Nothing a campaign is called is ever written as markup
function campDraw() {
    var list = document.getElementById('campMenuList'), sel = document.getElementById('campaignSelect'); if (!list) return;
    while (list.firstChild) list.removeChild(list.firstChild);
    campRows(sel).forEach(function(r) {
        var b = document.createElement('button'), slot = document.createElement('span');
        b.type = 'button'; b.className = 'rm-row' + (r.on ? ' on' : ''); b.setAttribute('data-camp', r.id); if (r.on) b.setAttribute('aria-current', 'true');
        slot.className = 'rm-slot'; b.appendChild(slot); b.appendChild(document.createTextNode(r.name));
        list.appendChild(b);
    });
}
// The name on the row's button follows the select: after a pick, after the list was filled again, after a switch was refused
function campSync() {
    var nm = document.getElementById('campMenuName'), sel = document.getElementById('campaignSelect');
    if (nm) nm.textContent = campName(sel);
    if (menuShown('campMenu')) campDraw();
}
// A press on a campaign's row: the select takes it and says so, as a pick in the select did. true: it was said
function campPick(id) {
    var sel = document.getElementById('campaignSelect'), known = campRows(sel).some(function(r) { return r.id === id; });   // an id that is no text, and a page with no list, name no campaign
    if (!known || sel.value === id) return false;
    sel.value = id; sel.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
}
// The row's controls do not fit on one line: the header grew past one row
function rowWraps() { var h = document.querySelector('header'); return !!h && h.offsetHeight > ONE_ROW; }
// The row is fitted to the window, one icon at a time (1.6.0): with every icon back it is asked whether it wraps, and while it does the next
// icon of FOLD_ORDER steps out, until the row holds one line. With all six out and the row still wrapping, the row goes tight (row-tight: the
// saved note put away, a pill cut short). A row that wraps even then is left whole, on its two lines, since folding would hide six controls
// and win nothing. Nothing is drawn in between. An icon that stepped out wears row-fold, the style sheet's
// one word for it, the body carries row-narrow while any did, and the » button shows. While the tour's card is up nothing folds, so that a
// step finds the control it points at. true: folded
var FOLD_ORDER = ['helpBtn', 'handoutsBtn', 'soundInd', 'musicInd', 'journalBtn', 'voiceInd'];   // your picture (#rowMeBtn, 1.6.0) never folds, as Settings does not (the owner, by prompt: "Stays, like Settings")
function foldSet(n) {
    FOLD_ORDER.forEach(function(id, i) { var c = document.getElementById(id); if (c) c.classList.toggle('row-fold', i < n); });
    document.body.classList.toggle('row-narrow', n > 0); document.body.classList.toggle('row-squeeze', n >= FOLD_ORDER.length); var b = document.getElementById('rowTrayBtn'); if (b) b.hidden = !(n > 0);
    return n;
}
function foldFit() {
    var cl = document.body.classList, n = 0;
    foldSet(0); cl.toggle('row-tight', false);
    if (!cl.contains('tour-on') && rowWraps()) {
        for (n = 1; n <= FOLD_ORDER.length; n++) { foldSet(n); if (!rowWraps()) break; }
        if (n > FOLD_ORDER.length) { cl.toggle('row-tight', true); if (rowWraps()) { cl.toggle('row-tight', false); n = foldSet(0); } else n = FOLD_ORDER.length; }   // 1.6.0, found by hand: the Round pill's words sent every icon back onto a second line
    }
    foldSync();
    return n > 0;
}
// A button of the tray stands for an icon that stepped out of the row, and shows only while that icon would show were it in the row: one that
// its own module, the table's role or a feature switched off hides has none either. So it is asked with its fold taken off for the moment of
// the question, and nothing is drawn in between. The » button says how many show, and goes where none does. true: at least one shows
function foldSync() {
    var rows = Array.prototype.slice.call(document.querySelectorAll('#rowTray [data-press]')), shown = 0;
    rows.forEach(function(r) { var c = document.getElementById(r.getAttribute('data-press')), on = false; if (c && c.classList.contains('row-fold')) { c.classList.remove('row-fold'); on = getComputedStyle(c).display !== 'none'; c.classList.add('row-fold'); } r.hidden = !on; if (on) shown++; });
    var b = document.getElementById('rowTrayBtn'), nb = document.getElementById('rowTrayN'); if (nb) nb.textContent = shown ? String(shown) : ''; if (b && !shown) b.hidden = true;
    if (!shown && menuShown('rowTray')) menuSet('rowTray', false);
    return shown > 0;
}
// A count that a folded control wears, the Journal's unread pages, is said in the tray too: on that control's button, and as a dot on the »
// button. true: there is one to say.
// So is what Sound's and Music's icons say in the row: off for you (the icon struck through), off here, or muted (the icon dimmed). Their
// rows say it in words and wear the icon's look. That is no count, so it puts no dot on More
function markSync() {
    var any = false;
    Array.prototype.forEach.call(document.querySelectorAll('#rowTray [data-badge]'), function(s) {
        var b = document.getElementById(s.getAttribute('data-badge')), txt = b && b.style.display !== 'none' ? String(b.textContent || '') : '', c = s.parentNode && s.parentNode.getAttribute ? document.getElementById(s.parentNode.getAttribute('data-press')) : null;
        s.textContent = txt; if (txt && c && c.classList.contains('row-fold')) any = true;   // a dot only for a count the row no longer shows
    });
    Array.prototype.forEach.call(document.querySelectorAll('#rowTray [data-state]'), function(s) {
        var row = s.parentNode, c = row && row.getAttribute ? document.getElementById(row.getAttribute('data-press')) : null, cl = c && c.classList;
        var mine = !!cl && cl.contains('off-mine'), off = !!cl && cl.contains('sound-off'), mute = !!cl && cl.contains('muted');
        s.textContent = mine ? 'Off for you' : off ? 'Off' : mute ? 'Muted' : '';
        if (row && row.classList) { row.classList.toggle('off-mine', mine); row.classList.toggle('dim', !mine && (off || mute)); }
    });
    var mb = menuBtn('rowTray'); if (mb) mb.classList.toggle('marked', any);
    return any;
}
// Where a control's own pop-up stands: by the control, or by the » button while the control stepped out of the row and has no box of its own
function anchorBox(el) {
    var r = el.getBoundingClientRect(), mb = r.width || r.height ? null : menuBtn('rowTray');
    return mb ? mb.getBoundingClientRect() : r;
}
// [lookcheck:toprow-end]

// [lookcheck:toprowwire-start]
function wire() {
    MENUS.forEach(function(id) {
        var b = menuBtn(id), m = document.getElementById(id); if (!b || !m) return;
        b.addEventListener('click', function(e) {   // the press goes on to the page, so that a menu elsewhere that closes at a press does
            if (menuShown(id)) { menuSet(id, false); return; }
            openMenu(id); if (e.detail === 0) menuFocus(id);   // detail 0: pressed from the keyboard, so the focus goes into the menu
        });
        var onKey = function(e) {
            if (!menuShown(id)) { if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); openMenu(id); menuFocus(id); } return; }   // on the button, its menu put away: Down opens it
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); menuSet(id, false); b.focus(); return; }   // Escape puts it away, goes no further, and hands the focus back
            var rows = menuRows(id), at = rows.indexOf(document.activeElement), to = menuStep(e.key, at, rows.length);
            if (e.key === 'Home' || e.key === 'End') { var se = menuSubEnd(e.key, at, rows.map(function(x) { var d = x.closest ? x.closest('.dropdown') : null; return d && d !== m && m.contains(d) ? d : null; })); if (se >= 0) to = se; }   // 1.6.0 (the sweep of 2026-10-17, seen live): inside a list beside the menu, as Export As's kinds, Home and End stay in that list
            if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) to = menuType(rows.map(function(r) { return r.textContent; }), at, e.key);   // a key of one character is a letter, never an arrow: the next row that begins with it. The space bar begins no row's words, so it stays the press it is
            if (to < 0 && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); e.stopPropagation(); return; }   // the page's own keys for what is selected on the map: a menu that has the focus takes them and does nothing with them (the review of 2026-10-09)
            if (to < 0) return;
            e.preventDefault(); e.stopPropagation(); rows[to].focus();   // the key is the menu's and goes no further: the page's own arrow keys move a selected token (the owed review, 2026-10-09)
        };
        b.addEventListener('keydown', onKey); m.addEventListener('keydown', onKey);   // the focus is on the button or on a row: the keys are the menu's only there
        m.addEventListener('click', function(e) {
            var t = e.target, camp = t.closest && t.closest('[data-camp]'), press = t.closest && t.closest('[data-press]'), row = t.closest && t.closest('button, .menu-item');
            if (camp) { menuSet(id, false); b.focus(); campPick(camp.getAttribute('data-camp')); return; }   // a campaign. The focus goes back to the name first: a question the switch raises takes it from there
            if (press) { menuSet(id, false); var c = document.getElementById(press.getAttribute('data-press')); if (c) c.click(); return; }   // a row that stands for a control of the row presses that control
            if (row && row.getAttribute('aria-haspopup') !== 'true' && row.getAttribute('data-keep') == null) menuSet(id, false);   // any other row is the control itself: its own handler does the work and the menu steps aside. One that opens a list beside the menu leaves it up, and so does one marked data-keep (the bell's x and Clear all: 1.5.5)
        });
    });
    document.addEventListener('pointerdown', function(e) {   // a press anywhere else puts an open menu away
        if (e.target.closest && (e.target.closest('.row-menu') || e.target.closest('[aria-haspopup="true"][aria-controls]') || e.target.closest('#tourCard'))) return;   // nor a press on the tour's card: a step may be showing a row of the menu
        closeMenus();
    }, true);
    var sel = document.getElementById('campaignSelect'), hdr = document.querySelector('header'), touring = document.body.classList.contains('tour-on'), due = false;
    var fitSoon = function() { if (due) return; due = true; var go = function() { if (!due) return; due = false; foldFit(); }; requestAnimationFrame(go); setTimeout(go, 150); };   // once a frame at most, and before that frame is drawn; 1.6.0: a timer too, since a page out of sight runs no frame, and one held back stopped every later fit
    if (sel) sel.addEventListener('change', campSync);
    if (typeof ResizeObserver === 'function' && hdr) { var ro = new ResizeObserver(fitSoon); ro.observe(hdr); Array.prototype.forEach.call(hdr.children, function(c) { ro.observe(c); }); }   // the window, or anything in the row, changed its size
    else window.addEventListener('resize', fitSoon);
    if (typeof MutationObserver === 'function') {
        if (sel) new MutationObserver(campSync).observe(sel, { childList: true });   // filled again: a new campaign, a rename, a switch that was refused
        new MutationObserver(function() { var now = document.body.classList.contains('tour-on'); if (now !== touring) { touring = now; fitSoon(); } }).observe(document.body, { attributes: true, attributeFilter: ['class'] });   // the tour's card going up or away. The fold's own word on the body is no news
        Array.prototype.forEach.call(document.querySelectorAll('#rowTray [data-badge]'), function(s) {   // a count changing on a control that may be folded
            var bd = document.getElementById(s.getAttribute('data-badge')); if (bd) new MutationObserver(markSync).observe(bd, { attributes: true, attributeFilter: ['style'], childList: true, characterData: true, subtree: true });
        });
        Array.prototype.forEach.call(document.querySelectorAll('#rowTray [data-state]'), function(s) {   // Sound or Music muted, or switched off, while it may be folded
            var cs = s.parentNode && s.parentNode.getAttribute ? document.getElementById(s.parentNode.getAttribute('data-press')) : null; if (cs) new MutationObserver(markSync).observe(cs, { attributes: true, attributeFilter: ['class'] });
        });
    }
    campSync(); foldFit(); markSync();
}

// [lookcheck:toprowwire-end]

// [sinkcheck:report-start]
/* Report a problem (1.5.4, backlog 34; the owner picked "Small table extras": "a Report a problem row that opens a filled-in GitHub issue page
   in your browser. Nothing is sent by itself."). The row in More presses the link in About (its data-press), so the one place a click on a
   link is decided, linkgate.js, opens it: About is the app's own words, and in the shell a web address goes to the system browser. The
   address is the project's new issue page with its body filled in: Waypoint's version and the kind of computer, in plain words, and nothing
   else of the user's. No title is set. Nothing is sent: the page waits for its own button. The link holds the bare page until this runs. */
var REPORT_NEW = 'https://github.com/ImmuneMoon/Waypoint/issues/new';
// The version as version.json gives it, or 'unknown': nothing but a version's own characters reaches the address
function reportVersion(v) { return typeof v === 'string' && /^[0-9A-Za-z.+-]{1,40}$/.test(v) ? v : 'unknown'; }
// The kind of computer and whether this is the desktop app, read from the browser's own words; nothing else of them
function reportPlatform(ua) {
    ua = typeof ua === 'string' ? ua : '';
    var os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Macintosh|Mac OS X/.test(ua) ? 'macOS' : /Linux|X11/.test(ua) ? 'Linux' : 'another system';
    return os + ', ' + (/\bElectron\//.test(ua) ? 'the desktop app' : 'a web browser');
}
function reportUrl(version, ua) {
    var body = 'Waypoint version: ' + reportVersion(version) + '\nPlatform: ' + reportPlatform(ua) + '\n\nWhat happened:\n\n\nWhat you expected:\n\n\nHow to make it happen again:\n\n';
    return REPORT_NEW + '?body=' + encodeURIComponent(body);
}
// About's link takes the address, once the version is known and whenever it changes. Answers the address, or '' with no link in the page
function reportSync() {
    var a = document.getElementById('aboutReportLink'); if (!a) return '';
    var href = reportUrl(window.wpAppVersion, typeof navigator !== 'undefined' && navigator ? navigator.userAgent : '');
    if (a.getAttribute('href') !== href) a.setAttribute('href', href);
    return href;
}
// [sinkcheck:report-end]
reportSync(); document.addEventListener('wp-version', reportSync);
wire();
window.wpTopRow = { open: openMenu, close: closeMenus, shown: menuShown, sync: campSync, box: anchorBox };
