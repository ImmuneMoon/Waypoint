// helpchips.js — Help shows the real buttons (1.6.2, backlog 142; the owner, 2026-10-16: "when speaking of buttons in help, lets show the actual
// buttons instead of placeholders", picked "A chip that finds it" and "Every button and menu row"; 2026-11-04: a control in a closed window "Open it
// and light it up", one this screen does not have "Drawn, says why", and "The System editor first"). A bold name of Help marked data-ctl stands for one
// control: a tab of the System editor ('sys-tab:<tab>') or a control by its id ('#<id>'). When Help opens, each is drawn as a copy of the control as it
// looks in the app, made from the real one (its words and its drawing, never its listeners, ids or handlers). Pressing it puts Help aside, opens the
// window it lives in on its tab, brings it into view and lights it for two seconds, and Back to Help returns to the place Help was left. A control this
// screen cannot reach (the System editor on a player's app) is drawn greyed and says why. Nothing is stored or sent
// [helpchipcheck:core-start]
function chipHelpBox(doc) { return doc.getElementById('helpModal'); }
// a window a control may live in, the control that opens it, and what a tab of it is called: the System editor for now
var CHIP_WINDOWS = { systemModal: { open: 'systemBtn', tabs: '.sys-tabs button[data-tab]', tabOf: function(el) { var t = el && el.closest ? el.closest('.sys-tab') : null; return t && t.id ? CHIP_TAB_IDS[t.id] || '' : ''; } },
    settingsModal: { open: 'settingsBtn' }, profileModal: { open: 'rowMeBtn' }, netModal: { open: 'netBtn' } };   // fold 3: Settings, your profile and Multiplayer, which have no tabs: a group of Settings unfolds and a part of Multiplayer opens by its own button
// fold 3: a part of a window that shows only at times, and the words a chip says while it does not
var CHIP_WHEN = { netHostInfo: 'While you host', setUpdateRow: 'When an update is found', setRelayBlock: 'With a relay server set' };
var CHIP_TAB_IDS = { sysFields: 'fields', sysRolls: 'rolls', sysItems: 'items', sysLists: 'lists', sysEffects: 'effects', sysCombat: 'combat', sysRules: 'rules', sysChars: 'chars', sysLayout: 'layout', sysCalendar: 'calendar' };
var CHIP_KEY = /^(?:sys-tab:[a-z]{1,16}|sys:[a-z]{1,16}:[a-z][a-z0-9-]{0,63}|#[A-Za-z][A-Za-z0-9_-]{0,63})$/;   // a tab, the first control of a class inside a tab, or a control by its id
// the control a key names in this document, and the window that holds it (none for a control of the page itself)
function chipFind(doc, key) {
    if (typeof key !== 'string' || !CHIP_KEY.test(key)) return null;
    var el = null;
    if (key.indexOf('sys-tab:') === 0) { var tb = key.slice(8), all = doc.querySelectorAll('#systemModal .sys-tabs button[data-tab]'); for (var i = 0; i < all.length; i++) if (all[i].dataset.tab === tb) el = all[i]; }
    else if (key.indexOf('sys:') === 0) { var pp = key.split(':'), tid = ''; for (var k in CHIP_TAB_IDS) if (CHIP_TAB_IDS[k] === pp[1]) tid = k; var tb2 = tid ? doc.getElementById(tid) : null; el = tb2 ? tb2.querySelector('.' + pp[2]) : null; }
    else el = doc.getElementById(key.slice(1));
    if (!el) return null;
    var win = null; for (var w in CHIP_WINDOWS) if (Object.prototype.hasOwnProperty.call(CHIP_WINDOWS, w)) { var box = doc.getElementById(w); if (box && box.contains(el)) win = w; }
    return { el: el, win: win };
}
// 1.6.2 fold 2, the top row: the menus that hold a control, outermost first, each with the button that opens it (a menu of the row names its button
// by aria-controls; Export As's list has its own); a control the row folded into the » tray is reached by its stand-in there
var CHIP_OPENERS = { saveAsMenu: 'saveAsBtn' };
function chipMenus(doc, el) {
    var out = [];
    for (var n = el && el.parentNode; n && n.getAttribute; n = n.parentNode) {
        var id = n.id; if (!id) continue;
        var op = CHIP_OPENERS[id] ? doc.getElementById(CHIP_OPENERS[id]) : chipOpener(doc, id); if (op) out.unshift({ box: n, open: op });
    }
    return out;
}
// the button that opens a part, never a chip's copy of it in Help (fold 3: Join a table is both)
function chipOpener(doc, id) { var all = doc.querySelectorAll('[aria-controls="' + id + '"]'), help = chipHelpBox(doc); for (var i = 0; i < all.length; i++) if (!(help && help.contains(all[i]))) return all[i]; return null; }
function chipShut(box) { return !!box && (box.hidden === true || (box.style && box.style.display === 'none')); }
function chipStand(doc, el) {   // what stands for a control: itself, or its button in the tray while the row has folded it away
    if (el && el.classList && el.classList.contains('row-fold') && el.id) { var t = doc.querySelector('#rowTray [data-press="' + el.id + '"]'); if (t) return t; }
    return el;
}
// whether this screen may reach it, and the words where it may not
function chipReach(doc, f) {
    if (!f) return 'Not on this screen';
    if (!f.win && f.el.closest && f.el.closest('.gm-only') && doc.body && doc.body.classList && doc.body.classList.contains('net-client')) return 'The GM\u2019s';   // fold 2: a control of the GM's, on a player's app
    if (!f.win) { var st = chipStand(doc, f.el); return st === f.el && !chipMenus(doc, f.el).length && f.el.offsetParent === null && f.el.style.display === 'none' ? 'Not on this screen' : ''; }
    var op = doc.getElementById(CHIP_WINDOWS[f.win].open); if (!op) return 'Not on this screen';
    if (op.style.display === 'none' || op.hidden) return 'The GM’s';
    if (CHIP_WINDOWS[f.win].tabs) return '';   // a window with tabs opens the control's tab (chipGo)
    var box = doc.getElementById(f.win);   // fold 3: a part of the window put away until it applies, which no button of the window opens
    for (var n = f.el.parentNode; n && n !== box; n = n.parentNode) { if (!n.id || !n.style || n.style.display !== 'none') continue; if (chipOpener(doc, n.id)) continue; return CHIP_WHEN[n.id] || 'Not shown now'; }
    return '';
}
// fold 3: the closed groups of Settings around a control, outermost first
function chipFolds(el, box) { var out = []; for (var n = el && el.parentNode; n && n !== box; n = n.parentNode) if (n.tagName === 'DETAILS' && !n.open) out.unshift(n); return out; }
// the copy a chip shows: the control's own element with its words and its drawing, made inert (no id, no handler, no focus of its own), inside the
// classes of the control's parent, so the style sheet draws it as in the app
function chipCopy(doc, el) {
    var c = el.cloneNode(true); c.removeAttribute('id'); c.removeAttribute('title'); c.removeAttribute('data-tip'); c.removeAttribute('disabled'); c.setAttribute('tabindex', '-1'); c.setAttribute('aria-hidden', 'true');
    c.removeAttribute('aria-controls'); c.removeAttribute('aria-expanded');   // fold 3: a copy opens nothing and is found by nothing
    var all = c.querySelectorAll ? c.querySelectorAll('[id]') : []; for (var i = 0; i < all.length; i++) all[i].removeAttribute('id');
    var wrap = doc.createElement('span'); wrap.className = 'help-chip-in ' + (el.parentNode && typeof el.parentNode.className === 'string' ? el.parentNode.className : ''); wrap.appendChild(c);
    return wrap;
}
// [helpchipcheck:core-end]
// [helpchipcheck:wire-start]
var _chipBack = null;   // where Help was left: its pane and its scroll
// draw every chip of Help as it opens: a bold name stays as it is where its control is not in the page at all
function chipsDraw(doc) {
    var help = chipHelpBox(doc); if (!help) return 0; var n = 0;
    var marks = help.querySelectorAll('b[data-ctl]');
    for (var i = 0; i < marks.length; i++) {
        var b = marks[i], key = b.getAttribute('data-ctl'), f = chipFind(doc, key); if (!f) continue;
        if (!b.dataset.name) b.dataset.name = String(b.textContent || '').replace(/\s+/g, ' ').trim();   // Help's own words for it, kept before the chip takes their place
        var chip = b.querySelector('.help-chip');
        if (!chip) { chip = doc.createElement('span'); chip.className = 'help-chip'; chip.setAttribute('role', 'button'); chip.dataset.ctl = key; b.textContent = ''; b.appendChild(chip); }
        chip.textContent = ''; chip.appendChild(chipCopy(doc, f.el));
        var why = chipReach(doc, f); chip.classList.toggle('help-chip-off', !!why); chip.setAttribute('tabindex', why ? '-1' : '0'); chip.setAttribute('aria-disabled', why ? 'true' : 'false');
        var words = (b.dataset.name || (f.el.textContent || '').replace(/\s+/g, ' ').trim() || String(f.el.getAttribute('title') || '').split('.')[0].trim()).replace(/[.\u2026:]+$/, ''); chip.setAttribute('aria-label', words); chip.dataset.tip = why ? words + '. ' + why + '.' : 'Show me ' + words + '.';   // fold 2: an icon alone says itself by its tooltip   // a chip says itself in Help's words (a menu row's own may hold more, such as how many kinds it lists), never ending in two stops
        n++;
    }
    return n;
}
// the part of Help on screen: the first pane not put away
function chipPaneOn(help) { var ps = help ? help.querySelectorAll('.help-pane') : []; for (var i = 0; i < ps.length; i++) if (ps[i].style.display !== 'none') return ps[i]; return null; }
// press: Help aside, the window open on its tab, the control in view and lit; then Back to Help
function chipGo(doc, key) {
    var f = chipFind(doc, key); if (!f || chipReach(doc, f)) return false;
    var help = chipHelpBox(doc), pane = chipPaneOn(help), body = pane ? pane.parentNode : null;
    _chipBack = { pane: pane ? pane.dataset.pane : '', top: body ? body.scrollTop : 0 };
    if (help) help.style.display = 'none';
    if (f.win && !CHIP_WINDOWS[f.win].tabs) {   // fold 3: a window with no tabs opens now, and a moment after, its group or its part, and the control is lit
        var boxW = doc.getElementById(f.win); if (boxW && boxW.style.display === 'none') { var opW = doc.getElementById(CHIP_WINDOWS[f.win].open); if (opW) opW.click(); }
        chipBackShow(doc);
        setTimeout(function() {
            chipFolds(f.el, boxW).forEach(function(d) { d.open = true; });
            chipMenus(doc, f.el).forEach(function(m) { if (boxW && boxW.contains(m.box) && chipShut(m.box) && m.open.click) m.open.click(); });
            var elW = f.el; if (elW.scrollIntoView) elW.scrollIntoView({ block: 'center' }); elW.classList.add('help-found'); setTimeout(function() { elW.classList.remove('help-found'); }, 2000);
        }, 0);
        return true;
    }
    if (f.win) {
        var box = doc.getElementById(f.win); if (box && box.style.display === 'none') { var op = doc.getElementById(CHIP_WINDOWS[f.win].open); if (op) op.click(); }
        var tab = key.indexOf('sys-tab:') === 0 ? key.slice(8) : key.indexOf('sys:') === 0 ? key.split(':')[1] : CHIP_WINDOWS[f.win].tabOf(f.el);
        if (tab) { var tbs = doc.querySelectorAll('#' + f.win + ' ' + CHIP_WINDOWS[f.win].tabs); for (var i = 0; i < tbs.length; i++) if (tbs[i].dataset.tab === tab && !tbs[i].classList.contains('active')) tbs[i].click(); }
        f = chipFind(doc, key) || f;
    }
    var lit = function() { var el = f.win ? f.el : chipStand(doc, f.el); if (el.scrollIntoView) el.scrollIntoView({ block: 'center' }); el.classList.add('help-found'); setTimeout(function() { el.classList.remove('help-found'); }, 2000); };
    if (!f.win) {   // fold 2: the top row: open what holds it a moment after Help steps aside, so the press that put Help away does not close it again
        var st = chipStand(doc, f.el), chain = chipMenus(doc, st); chipBackShow(doc);
        setTimeout(function() { chain.forEach(function(m) { if (chipShut(m.box) && m.open.click) m.open.click(); }); lit(); }, 0);
        return true;
    }
    lit();
    chipBackShow(doc);
    return true;
}
function chipBackShow(doc) {
    var b = doc.getElementById('helpBackBtn'); if (!b) { b = doc.createElement('button'); b.id = 'helpBackBtn'; b.type = 'button'; b.className = 'tool help-back'; b.textContent = 'Back to Help'; b.dataset.tip = 'Open Help again where you left it'; b.addEventListener('click', function() { chipBack(doc); }); doc.body.appendChild(b); }
    b.hidden = false;
}
function chipBack(doc) {
    var b = doc.getElementById('helpBackBtn'); if (b) b.hidden = true;
    var at = _chipBack; _chipBack = null; if (!at) return;
    var hb = chipHelpBox(doc); if (hb) hb.classList.add('help-over');   // over the window the chip opened, which stands higher than Help
    if (typeof window !== 'undefined' && typeof window.wpOpenHelp === 'function') window.wpOpenHelp(at.pane || 'start');
    var help = chipHelpBox(doc), pane = help ? help.querySelector('.help-pane[data-pane="' + (at.pane || 'start') + '"]') : null; if (pane && pane.parentNode) setTimeout(function() { pane.parentNode.scrollTop = at.top; }, 80);
}
function chipsWire(doc) {
    var help = chipHelpBox(doc); if (!help) return;
    help.addEventListener('click', function(e) { var c = e.target && e.target.closest ? e.target.closest('.help-chip') : null; if (!c || c.classList.contains('help-chip-off')) return; e.preventDefault(); chipGo(doc, c.dataset.ctl); });
    help.addEventListener('keydown', function(e) { if (e.key !== 'Enter' && e.key !== ' ') return; var c = e.target && e.target.closest ? e.target.closest('.help-chip') : null; if (!c || c.classList.contains('help-chip-off')) return; e.preventDefault(); chipGo(doc, c.dataset.ctl); });
    if (typeof MutationObserver === 'function') new MutationObserver(function() { if (help.style.display !== 'none') { chipsDraw(doc); var b = doc.getElementById('helpBackBtn'); if (b) b.hidden = true; } else help.classList.remove('help-over'); }).observe(help, { attributes: true, attributeFilter: ['style'] });
}
// [helpchipcheck:wire-end]
if (typeof document !== 'undefined') chipsWire(document);
window.wpHelpChips = { draw: function() { return chipsDraw(document); }, go: function(k) { return chipGo(document, k); } };
