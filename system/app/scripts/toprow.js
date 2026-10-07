/* The top row's own menus (1.5.4, backlog 107).
   The owner, 2026-10-06, of the top of the window: "one slim row, with the option of hiding it"; the mock-up was passed "as drawn". A menu of
   the row takes controls out of the row without taking any away: each control keeps its id and its own handler, and is in the page once.

   The CAMPAIGN menu opens from the campaign's name. It lists the campaigns, and holds Search, New, Rename, System and Delete. The list's own
   source is the page's <select id="campaignSelect">, which every other module fills, reads and listens to as it always did: it stays in the
   page, out of sight. A row of the list is an element with a text node, since a campaign's name can come from a file, and a press on a row
   sets the select and says so with a change event, exactly as a pick in the select did. So a session's guard on a campaign switch, and
   everything else that hangs on that event, runs as before.

   A list could be worked from the keyboard, so a menu can be too, with the keys the page's Outline menu has: Down on the name opens it, the
   arrow keys, Home and End go through its rows, Enter presses the row that has the focus, and Escape puts it away. */
// [lookcheck:toprow-start]
var MENUS = ['campMenu'];   // every menu of the row, by its id. Its button is the one whose aria-controls names it
function menuBtn(id) { return document.querySelector('[aria-controls="' + id + '"]'); }
function menuShown(id) { var m = document.getElementById(id); return !!m && m.hidden !== true; }
function menuSet(id, show) {
    var m = document.getElementById(id), b = menuBtn(id); if (!m) return false;
    m.hidden = show !== true; if (b) b.setAttribute('aria-expanded', show === true ? 'true' : 'false');
    return true;
}
function closeMenus(but) { var any = false; MENUS.forEach(function(id) { if (id !== but && menuShown(id)) { menuSet(id, false); any = true; } }); return any; }
function openMenu(id) {   // one menu of the row is up at a time
    if (MENUS.indexOf(id) < 0) return false;
    closeMenus(id); if (id === 'campMenu') campDraw();
    return menuSet(id, true);
}
// A menu's rows are its buttons, in the order they stand in
function menuRows(id) { var m = document.getElementById(id); return m ? Array.prototype.slice.call(m.querySelectorAll('button')) : []; }
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
            var rows = menuRows(id), to = menuStep(e.key, rows.indexOf(document.activeElement), rows.length); if (to < 0) return;
            e.preventDefault(); rows[to].focus();
        };
        b.addEventListener('keydown', onKey); m.addEventListener('keydown', onKey);   // the focus is on the button or on a row: the keys are the menu's only there
    });
    var cm = document.getElementById('campMenu'), cb = menuBtn('campMenu');
    if (cm) cm.addEventListener('click', function(e) {
        var row = e.target.closest && e.target.closest('[data-camp]');
        if (row) { menuSet('campMenu', false); if (cb) cb.focus(); campPick(row.getAttribute('data-camp')); return; }   // the focus goes back to the name first: a question the switch raises takes it from there
        if (e.target.closest && e.target.closest('button')) menuSet('campMenu', false);   // Search, New, Rename, System, Delete: the button's own handler does the work, the menu steps aside
    });
    document.addEventListener('pointerdown', function(e) {   // a press anywhere else puts an open menu away
        if (e.target.closest && (e.target.closest('.row-menu') || e.target.closest('[aria-haspopup="true"][aria-controls]') || e.target.closest('#tourCard'))) return;   // nor a press on the tour's card: a step may be showing a row of the menu
        closeMenus();
    }, true);
    var sel = document.getElementById('campaignSelect');
    if (sel) {
        sel.addEventListener('change', campSync);
        if (typeof MutationObserver === 'function') new MutationObserver(campSync).observe(sel, { childList: true });   // filled again: a new campaign, a rename, a switch that was refused
    }
    campSync();
}
// [lookcheck:toprowwire-end]
wire();
window.wpTopRow = { open: openMenu, close: closeMenus, shown: menuShown, sync: campSync };
