/* The top row's own menus (1.5.4, backlog 107).
   The owner, 2026-10-06, of the top of the window: "one slim row, with the option of hiding it"; the mock-up was passed "as drawn". A menu of
   the row takes controls out of the row without taking any away: each control keeps its id and its own handler, and is in the page once.

   The CAMPAIGN menu opens from the campaign's name. It lists the campaigns, and holds Search, New, Rename, System and Delete. The list's own
   source is the page's <select id="campaignSelect">, which every other module fills, reads and listens to as it always did: it stays in the
   page, out of sight. A row of the list is an element with a text node, since a campaign's name can come from a file, and a press on a row
   sets the select and says so with a change event, exactly as a pick in the select did. So a session's guard on a campaign switch, and
   everything else that hangs on that event, runs as before.

   The MORE menu opens from the three dots at the row's right end. It holds Export As, with its kinds in a list beside it, Import, Refresh,
   About and the way back to the welcome screen. In a narrow window Sound, Music, Handouts, Journal and Help leave the row: each has a row in
   More that presses the control itself, which stays in the page with its id and its handler, only out of sight.

   A list could be worked from the keyboard, so a menu can be too, with the keys the page's Outline menu has: Down on its button opens it, the
   arrow keys, Home and End go through its rows, a letter goes to the next row that begins with it, Enter presses the row that has the focus,
   and Escape puts the menu away. */
// [lookcheck:toprow-start]
var MENUS = ['campMenu', 'moreMenu'];   // every menu of the row, by its id. Its button is the one whose aria-controls names it
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
    closeMenus(id); if (id === 'campMenu') campDraw(); if (id === 'moreMenu') { foldSync(); markSync(); }
    return menuSet(id, true);
}
// A menu's rows are its buttons that are on screen, in the order they stand in: a row that is hidden takes no key and no focus
function menuRows(id) { var m = document.getElementById(id); return m ? Array.prototype.slice.call(m.querySelectorAll('button')).filter(function(r) { return r.offsetParent !== null; }) : []; }
// The keys of a menu: Down and Up go round its rows, Home and End to the first and the last. at: the row that has the focus, n: how many
// rows there are. Answers the row to go to, or -1 where the key is not the menu's
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
// The row is fitted to the window. Sound, Music, Handouts, Journal and Help fold into More only while that is what keeps the row on one
// line: it is asked with the fold taken off, then with it on, and nothing is drawn in between. A row that wraps even folded is left whole, on
// its two lines, since folding would hide five controls and win nothing. The page's body carries the answer as one word, and the style sheet
// folds the five by it. While the tour's card is up nothing folds, so that a step finds the control it points at. true: folded
function foldFit() {
    var cl = document.body.classList, was = cl.contains('row-narrow'), want = false;
    if (was) cl.remove('row-narrow');
    if (!cl.contains('tour-on') && rowWraps()) { cl.add('row-narrow'); want = !rowWraps(); if (!want) cl.remove('row-narrow'); }
    if (want !== was && menuShown('moreMenu')) foldSync();
    return want;
}
// A row of More that stands for a control folded out of the row shows only while that control would show, were the row not folded: one that
// its own module, the table's role or a feature switched off hides has no row either. So it is asked with the fold taken off for the moment
// of the question, and nothing is drawn in between. true: at least one row shows
function foldSync() {
    var rows = Array.prototype.slice.call(document.querySelectorAll('#moreFold [data-press]')), cl = document.body.classList, was = cl.contains('row-narrow'), any = false;
    if (was) cl.remove('row-narrow');
    rows.forEach(function(r) { var c = document.getElementById(r.getAttribute('data-press')), on = !!c && getComputedStyle(c).display !== 'none'; r.hidden = !on; if (on) any = true; });
    if (was) cl.add('row-narrow');
    return any;
}
// A count that a folded control wears, the Journal's unread pages, is said in More too: on that control's row, and as a dot on More's own
// button, which the style sheet shows only while the row is narrow. true: there is one to say
function markSync() {
    var any = false;
    Array.prototype.forEach.call(document.querySelectorAll('#moreMenu [data-badge]'), function(s) {
        var b = document.getElementById(s.getAttribute('data-badge')), txt = b && b.style.display !== 'none' ? String(b.textContent || '') : '';
        s.textContent = txt; if (txt) any = true;
    });
    var mb = menuBtn('moreMenu'); if (mb) mb.classList.toggle('marked', any);
    return any;
}
// Where a control's own pop-up stands: by the control, or by More's button while the control is folded into More and has no box of its own
function anchorBox(el) {
    var r = el.getBoundingClientRect(), mb = r.width || r.height ? null : menuBtn('moreMenu');
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
            if (!menuShown(id)) { if (e.key === 'ArrowDown') { e.preventDefault(); openMenu(id); menuFocus(id); } return; }   // on the button, its menu put away: Down opens it
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); menuSet(id, false); b.focus(); return; }   // Escape puts it away, goes no further, and hands the focus back
            var rows = menuRows(id), at = rows.indexOf(document.activeElement), to = menuStep(e.key, at, rows.length);
            if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) to = menuType(rows.map(function(r) { return r.textContent; }), at, e.key);   // a key of one character is a letter, never an arrow: the next row that begins with it. The space bar begins no row's words, so it stays the press it is
            if (to < 0) return;
            e.preventDefault(); rows[to].focus();
        };
        b.addEventListener('keydown', onKey); m.addEventListener('keydown', onKey);   // the focus is on the button or on a row: the keys are the menu's only there
        m.addEventListener('click', function(e) {
            var t = e.target, camp = t.closest && t.closest('[data-camp]'), press = t.closest && t.closest('[data-press]'), row = t.closest && t.closest('button, .menu-item');
            if (camp) { menuSet(id, false); b.focus(); campPick(camp.getAttribute('data-camp')); return; }   // a campaign. The focus goes back to the name first: a question the switch raises takes it from there
            if (press) { menuSet(id, false); var c = document.getElementById(press.getAttribute('data-press')); if (c) c.click(); return; }   // a row that stands for a control of the row presses that control
            if (row && row.getAttribute('aria-haspopup') !== 'true') menuSet(id, false);   // any other row is the control itself: its own handler does the work and the menu steps aside. One that opens a list beside the menu leaves it up
        });
    });
    document.addEventListener('pointerdown', function(e) {   // a press anywhere else puts an open menu away
        if (e.target.closest && (e.target.closest('.row-menu') || e.target.closest('[aria-haspopup="true"][aria-controls]') || e.target.closest('#tourCard'))) return;   // nor a press on the tour's card: a step may be showing a row of the menu
        closeMenus();
    }, true);
    var sel = document.getElementById('campaignSelect'), hdr = document.querySelector('header'), touring = document.body.classList.contains('tour-on'), due = false;
    var fitSoon = function() { if (due) return; due = true; requestAnimationFrame(function() { due = false; foldFit(); }); };   // once a frame at most, and before that frame is drawn
    if (sel) sel.addEventListener('change', campSync);
    if (typeof ResizeObserver === 'function' && hdr) { var ro = new ResizeObserver(fitSoon); ro.observe(hdr); Array.prototype.forEach.call(hdr.children, function(c) { ro.observe(c); }); }   // the window, or anything in the row, changed its size
    else window.addEventListener('resize', fitSoon);
    if (typeof MutationObserver === 'function') {
        if (sel) new MutationObserver(campSync).observe(sel, { childList: true });   // filled again: a new campaign, a rename, a switch that was refused
        new MutationObserver(function() { var now = document.body.classList.contains('tour-on'); if (now !== touring) { touring = now; fitSoon(); } }).observe(document.body, { attributes: true, attributeFilter: ['class'] });   // the tour's card going up or away. The fold's own word on the body is no news
        Array.prototype.forEach.call(document.querySelectorAll('#moreMenu [data-badge]'), function(s) {   // a count changing on a control that may be folded
            var bd = document.getElementById(s.getAttribute('data-badge')); if (bd) new MutationObserver(markSync).observe(bd, { attributes: true, attributeFilter: ['style'], childList: true, characterData: true, subtree: true });
        });
    }
    campSync(); foldFit(); markSync();
}
// [lookcheck:toprowwire-end]
wire();
window.wpTopRow = { open: openMenu, close: closeMenus, shown: menuShown, sync: campSync, box: anchorBox };
