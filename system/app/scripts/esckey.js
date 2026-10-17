/* Escape closes the one thing on top (1.5.4).
   The owner, 2026-10-17, by prompt: "Close the top one (Recommended)": each press closes the one thing on top: the right-click menu,
   then a menu, then a window; nothing behind it hears the key; the target pointer and the tool in hand are only cleared when nothing else
   was open.

   One listener hears Escape first, at the window in the capture phase, and judges what is on top (escJudge):
   - a question or a prompt of the app's own, the tour, the cleanup's questions, a dialog that hears Escape first at the window (the token
     creator, the three generators, Save Map as Picture), the Image Library's preview and a video filling the window keep their own rules:
     the key is left to them, and nothing else hears it as free (aside);
   - else a right-click menu is put away (close);
   - else an open menu: of the top row, of a toolbar, the party's, the library's categories, a section's actions, the colour of a selection.
     A tool's own options are such a menu (the owner, 2026-10-17, by prompt: "Close the options first (Recommended)"): the first Escape
     closes them and the tool stays in hand, and the next, with nothing open, puts the tool away. A menu whose bar stood back under the
     floating boxes (whiteboard.js BAR_BACK) is under the box that holds the focus, which goes first. A menu with keys of its own (the
     Outline, a face, the sheet's Download, a roll's modifier, a symbol tray, the glyph and library pickers) keeps them (aside);
   - else the window on top: the highest of the app's windows that show, pressed shut by its own close button;
   - else a text box on the map being edited loses the focus, which keeps what was typed;
   - else a floating box that holds the focus and answers Escape (the sheet, a HUD, Effects, Video, the page panel, the dice roller), or the
     left panel opened from its rail. Table Chat, the table notepad, Sound and Music close as a window does while the focus is in them (the
     owner, 2026-10-17, by prompt: "Yes, when on top (Recommended)"): Chat keeps its messages, and the notepad its words, put away on this
     screen alone (net.js notepadAway);
   - else, outside all of them, the box last used (floats.js last: pressed, given the focus or come up last) where it is one of those Escape
     closes from outside: the dice roller, the page panel, Table Chat, the notepad, Sound and Music. Where it is none of them (a sheet, a
     HUD), the box on top of the dice roller, the page panel and the left panel opened from its rail, as before;
   - else nothing was open: the key is free, and the map's own uses (the tool in hand, an armed placement or throw, the target pointer) ask
     free(e) before they act.
   What is closed at once is closed here and the key goes no further. Where the focus is in the very thing on top and that thing, or a box in
   it, gives Escape a meaning of its own (a text box's bar, a search that holds words, the System editor, the Library), the key goes down to
   it first (defer), and only if nobody took it (no preventDefault, nothing stopped it) is the thing closed when the key comes back up to the
   window. A key held down closes nothing new: the repeats of a press that was not free are swallowed, and each new press is judged anew. Nothing runs in a window of its own
   (a pop-out, the stream window). */

// [floatcheck:esc-start]
var ESC_ASIDE = ['customConfirm', 'customPrompt', 'cleanupAskModal', 'cleanupSummaryModal', 'cleanupMissingModal', 'cleanupBackupModal', 'frameModal', 'genModal', 'cityModal', 'worldModal', 'shotModal', 'imgLibPreview'];
var ESC_RIGHT = ['contextMenu', 'sidebarContextMenu', 'edgeMenu', 'charMenu'];   // the right-click menus: put away by their display
var ESC_OWN_MENUS = '#pageNavMenu, .face-pop, .sheet-dl-pop, .dice-modpop, .sys-glyph-pop, .lib-pick, .rte-symwrap.open';   // menus whose own listener takes Escape
var ESC_ROW_MENUS = ['campMenu', 'moreMenu'];   // the top row's (toprow.js): put away by hidden
var ESC_TOOL_OPTS = ['drawMenu', 'eraserMenu', 'fillMenu', 'measureMenu', 'blastMenu', 'buildMenu'];   // a tool's options: a menu the first Escape closes, the tool staying in hand; a field of theirs keeps its own Escape first (the Radius tool's two boxes)
// The app's windows, each with the button that closes it ('' where hiding it is all its own close does). A third place of 1: its own
// listener closes it on Escape and a box inside it may take the key first, so the key goes down to it when the focus is inside
var ESC_WINDOWS = [['helpModal', 'helpCloseBtn'], ['settingsModal', 'settingsCloseBtn'], ['netModal', 'netCloseBtn'], ['aboutModal', 'aboutCloseBtn'], ['legalModal', 'legalCloseBtn'],
    ['campSearchModal', 'campSearchClose'], ['plannerSearchModal', 'plannerSearchClose'], ['mapSearchModal', 'mapSearchClose'], ['docSearchModal', 'docSearchClose'],
    ['importChoiceModal', 'importCancelBtn'], ['imgLibModal', 'imgLibCloseBtn'], ['playersModal', 'playersCloseBtn'], ['sheetViewModal', 'sheetViewCloseBtn'],
    ['vttNoticeModal', 'vttNoticeKeepBtn'], ['vttPushModal', 'vttPushCancelBtn'], ['soundLibModal', 'soundLibClose'], ['systemModal', 'sysClose', 1], ['libraryModal', 'libClose', 1],
    ['calendarModal', 'calendarClose'], ['journalModal', 'journalCloseBtn'], ['combatModal', 'combatCloseBtn'], ['castModal', 'castCloseBtn'],
    ['handoutModal', 'handoutCloseBtn'], ['handoutsModal', 'handoutsCloseBtn'], ['installerModal', 'installerCloseBtn'], ['sessionLogModal', 'sessionLogClose'],
    ['uploadModal', 'uploadClose'], ['docReaderModal', 'docReaderClose'], ['docImportModal', 'docImportCancel'], ['cmdkModal', '']];
var ESC_BOXES = ['sheetPanel', 'fxPanel', 'videoPanel', 'docPanel', 'dicePanel'];   // floating boxes that answer Escape when the focus is in them (a HUD too)
// Table Chat, the table notepad, Sound and Music: closed on Escape as a window is, while the focus is in one of them or it is the box last
// used (the owner, 2026-10-17, by prompt: "Yes, when on top (Recommended)"). One whose module is not there to close it keeps its fields' keys
var ESC_LAST = ['chatPanel', 'notepadPanel', 'soundPanel', 'musicPanel'];

function escEach(list, fn) { if (list) for (var i = 0; i < list.length; i++) fn(list[i]); }
// Shown: drawn on the page (a box that is put away, or inside one, has no box to draw)
function escShown(el) { return !!el && typeof el.getClientRects === 'function' && el.getClientRects().length > 0; }
function escHas(el, t) { return !!el && !!t && typeof el.contains === 'function' && el.contains(t); }
function escAt(t, sel) { return !!t && typeof t.closest === 'function' && !!t.closest(sel); }
// A field: what is typed into (a text box, a list, a text input), never a button, a tick or a slider
function escField(t) {
    if (!t) return false;
    if (t.isContentEditable === true) return true;
    var tag = String(t.tagName || '').toUpperCase();
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
    return tag === 'INPUT' && /^(|text|search|email|number|password|url|tel|date|time|datetime-local|month|week)$/i.test(String(t.type || ''));
}
// Inside a window, a box that gives Escape a meaning of its own: the text bar (back to its box), a text box while its bar is up (the bar
// goes away), a search of Help or the Journal that holds words (they are cleared)
function escKeep(doc, t) {
    if (!t) return false;
    if (escAt(t, '#tsBar')) return true;
    var bar = doc.getElementById('tsBar');
    if (escAt(t, '.ts-box') && bar && bar.hidden !== true && escShown(bar)) return true;
    return (t.id === 'helpSearch' || t.id === 'journalSearch') && typeof t.value === 'string' && t.value !== '';
}
// The one painted on top: the highest z-index, and of two alike the one later in the page
function escZ(win, el) { var s = win && typeof win.getComputedStyle === 'function' ? win.getComputedStyle(el) : null, z = s ? parseInt(s.zIndex, 10) : NaN; return isFinite(z) ? z : 0; }
function escAfter(a, b) { return !!a && !!b && typeof b.compareDocumentPosition === 'function' && (b.compareDocumentPosition(a) & 4) === 4; }
function escTop(list, win) {
    var best = null, bz = 0;
    list.forEach(function(L) { var z = escZ(win, L.el); if (!best || z > bz || (z === bz && escAfter(L.el, best.el))) { best = L; bz = z; } });
    return best;
}
function escPress(doc, id) { var b = id ? doc.getElementById(id) : null; if (b && typeof b.click === 'function') { b.click(); return true; } return false; }
// The open menus Escape puts away itself: first the small ones that open over everything (the party's, the library's categories, a
// section's actions, a selection's colours), then the top row's, then a toolbar's
function escMenus(doc, win) {
    var out = [];
    var pm = doc.getElementById('partyMenu'); if (pm && pm.classList.contains('show') && escShown(pm)) out.push({ el: pm, close: function() { pm.classList.remove('show'); } });
    var ic = doc.getElementById('imgCatMenu'); if (escShown(ic)) out.push({ el: ic, close: function() { ic.classList.remove('show'); ic.style.display = 'none'; } });
    escEach(doc.querySelectorAll('.section-actions.show'), function(a) { if (escShown(a)) out.push({ el: a, close: function() { a.classList.remove('show'); a.style.left = ''; a.style.top = ''; } }); });
    escEach(doc.querySelectorAll('#selToolbar .st-color-pop'), function(p) { if (p.hidden !== true && escShown(p)) out.push({ el: p, close: function() { p.hidden = true; } }); });
    ['crumbMoreMenu', 'docAppearanceMenu'].forEach(function(id) {   // the path's hidden levels, a page's Appearance: made for the press that opened them, and gone at the next
        var m = doc.getElementById(id); if (escShown(m)) out.push({ el: m, close: function() { if (typeof m.remove === 'function') m.remove(); else m.style.display = 'none'; } });
    });
    ESC_ROW_MENUS.forEach(function(id) {
        var m = doc.getElementById(id); if (!m || m.hidden === true || !escShown(m)) return;
        var b = typeof doc.querySelector === 'function' ? doc.querySelector('[aria-controls="' + id + '"]') : null;
        out.push({ el: m, also: b, keep: true, close: function() { if (win.wpTopRow && typeof win.wpTopRow.close === 'function') win.wpTopRow.close(); else m.hidden = true; } });   // its own keys refocus its button
    });
    escEach(doc.querySelectorAll('.floating-toolbar .shape-menu.show'), function(m) {
        if (!escShown(m)) return;
        var shelf = m.id === 'pagesMenu' && win.wpPageShelf && typeof win.wpPageShelf.close === 'function', opts = ESC_TOOL_OPTS.indexOf(m.id) >= 0;
        out.push({ el: m, keep: shelf || opts, back: escAt(m, '.floating-toolbar.tb-back'), close: function() { if (shelf) win.wpPageShelf.close(); else m.classList.remove('show'); } });   // the Pages shelf takes its rows with it; a tool's options close as its small arrow closes them
    });
    return out;
}
function escWindows(doc) {
    var out = [];
    ESC_WINDOWS.forEach(function(w) {
        var el = doc.getElementById(w[0]); if (!escShown(el)) return;
        out.push({ el: el, own: w[2] === 1, close: function() { if (!escPress(doc, w[1])) el.style.display = 'none'; } });
    });
    return out;
}
// Table Chat by its own close button, the notepad on this screen alone, Sound and Music by their modules: each that shows and can be closed
function escLastBoxes(doc, win) {
    var N = win.wpNet, S = win.wpSound, M = win.wpMusic, out = [];
    var shut = { chatPanel: function(el) { if (!escPress(doc, 'chatCloseBtn')) el.style.display = 'none'; },
        notepadPanel: N && typeof N.notepadAway === 'function' ? function() { N.notepadAway(); } : null,
        soundPanel: S && typeof S.closePanel === 'function' ? function() { S.closePanel(); } : null,
        musicPanel: M && typeof M.closePanel === 'function' ? function() { M.closePanel(); } : null };
    ESC_LAST.forEach(function(id) { var el = doc.getElementById(id), fn = shut[id]; if (fn && escShown(el)) out.push({ el: el, close: function() { fn(el); } }); });
    return out;
}
// Does the focus stand in a floating box that shows (the sheet, a HUD, the page panel, Effects, Video, the dice roller, Table Chat, the
// notepad, Sound, Music)?
function escInBox(doc, t) {
    var hit = false;
    ESC_BOXES.concat(ESC_LAST).forEach(function(id) { var b = doc.getElementById(id); if (escShown(b) && escHas(b, t)) hit = true; });
    escEach(doc.querySelectorAll('#hudLayer .hud-panel'), function(b) { if (escShown(b) && escHas(b, t)) hit = true; });
    return hit;
}
// The floating boxes Escape closes from outside them: the dice roller, the page panel, the left panel opened from its rail
function escPanels(doc, win) {
    var out = [];
    var dp = doc.getElementById('dicePanel'); if (escShown(dp) && win.wpDice && typeof win.wpDice.closePanel === 'function') out.push({ el: dp, close: function() { win.wpDice.closePanel(); } });
    var pp = doc.getElementById('docPanel'), D = win.wpDocPanel;
    if (escShown(pp) && D && typeof D.close === 'function' && typeof D.openId === 'function' && D.openId()) out.push({ el: pp, close: function() { D.close(); } });
    var lp = doc.getElementById('campaignSidebar'), R = win.wpLeftRail;
    if (lp && R && typeof R.mode === 'function' && R.mode() === 'open' && typeof R.away === 'function') out.push({ el: lp, close: function() { R.away(); } });
    return out;
}
// What Escape does now: { act: 'aside' | 'close' | 'defer' | 'free', layer }. t: the element the key was pressed in
function escJudge(doc, win, t) {
    var body = doc.body;
    if (win.wpPopout || win.wpStream) return { act: 'free' };   // a window of its own: as it always was
    if (body && body.classList && body.classList.contains('tour-on')) return { act: 'aside' };
    for (var i = 0; i < ESC_ASIDE.length; i++) if (escShown(doc.getElementById(ESC_ASIDE[i]))) return { act: 'aside' };
    var vid = doc.getElementById('videoPanel'); if (vid && vid.classList && vid.classList.contains('vid-max') && escShown(vid)) return { act: 'aside' };   // a video filling the window steps back first, by its own key
    for (var r = 0; r < ESC_RIGHT.length; r++) {
        var rm = doc.getElementById(ESC_RIGHT[r]);
        if (escShown(rm)) return { act: 'close', layer: { el: rm, close: function() { rm.style.display = 'none'; } } };
    }
    var own = false; escEach(doc.querySelectorAll(ESC_OWN_MENUS), function(m) { if (escShown(m)) own = true; });
    if (own) return { act: 'aside' };
    var menu = escMenus(doc, win)[0];
    if (menu && menu.back && escInBox(doc, t)) menu = null;   // options that stood back under a box pressed since: that box is on top of them
    if (menu) return { act: menu.keep && (escHas(menu.el, t) || escHas(menu.also, t)) ? 'defer' : 'close', layer: menu };
    var w = escTop(escWindows(doc), win);
    if (w) return { act: escHas(w.el, t) && (w.own || escKeep(doc, t)) ? 'defer' : 'close', layer: w };
    if (t && t.isContentEditable === true && escAt(t, '.wb-item.editing')) return { act: 'close', layer: { el: t, close: function() { if (doc.activeElement === t && typeof t.blur === 'function') t.blur(); } } };   // a text box on the map loses the focus, which keeps what was typed
    var boxes = [];
    ESC_BOXES.forEach(function(id) { var b = doc.getElementById(id); if (b) boxes.push(b); });
    escEach(doc.querySelectorAll('#hudLayer .hud-panel'), function(b) { boxes.push(b); });
    for (var b = 0; b < boxes.length; b++) if (escShown(boxes[b]) && escHas(boxes[b], t)) {
        var mine = escPanels(doc, win).filter(function(L) { return L.el === boxes[b]; })[0];
        return { act: 'defer', layer: mine || { el: boxes[b] } };   // its own listener answers; the page panel and the dice roller are closed here if it does not
    }
    var lasts = escLastBoxes(doc, win);
    for (var l = 0; l < lasts.length; l++) if (escHas(lasts[l].el, t)) return { act: escKeep(doc, t) ? 'defer' : 'close', layer: lasts[l] };   // in use: closed as a window is, after a text bar's own Escape
    for (var f = 0; f < ESC_LAST.length; f++) { var fb = doc.getElementById(ESC_LAST[f]); if (escShown(fb) && escHas(fb, t) && escField(t)) return { act: 'defer', layer: { el: fb } }; }   // one no module closes: its fields keep their own keys
    var panels = escPanels(doc, win), left = panels.filter(function(L) { return L.el.id === 'campaignSidebar'; })[0];
    if (left && escHas(left.el, t)) return { act: 'defer', layer: left };
    var used = win.wpFloats && typeof win.wpFloats.last === 'function' ? win.wpFloats.last() : null;   // the box last used, of those that show
    var top = panels.concat(lasts).filter(function(L) { return !!used && L.el === used; })[0] || escTop(panels, win), first = escField(t) || escKeep(doc, t);   // a field's own Escape, and a text bar's, come first
    if (top) return { act: first ? 'defer' : 'close', layer: top };
    return { act: 'free' };
}
// The focus is taken out of what closes, so that a box in it is left as a box is left (what was typed is kept), never hidden with the focus
function escShut(L) {
    var a = typeof document !== 'undefined' ? document.activeElement : null;
    if (a && a !== document.body && escHas(L.el, a) && typeof a.blur === 'function') a.blur();
    L.close();
}

var _esc = { ev: null, free: false, pend: null, held: false };
function escDown(e) {
    if (!e || e.key !== 'Escape') return;
    _esc.ev = e; _esc.free = false; _esc.pend = null;
    if (e.repeat === true) { if (_esc.held) { e.preventDefault(); e.stopPropagation(); } return; }   // a key held down closes nothing new, and the repeats of a press that was not free go no further
    _esc.held = false;
    if (e.defaultPrevented) return;
    var j = escJudge(document, window, e.target || document.activeElement);
    if (j.act === 'free') { _esc.free = true; return; }
    _esc.held = true;
    if (j.act === 'close') { e.preventDefault(); e.stopPropagation(); escShut(j.layer); }
    else if (j.act === 'defer') _esc.pend = j.layer;
}
function escBack(e) {   // the key back at the window: a thing whose own listeners left it is closed now, if it still shows
    if (!e || e.key !== 'Escape' || _esc.ev !== e) return;
    var L = _esc.pend; _esc.pend = null;
    if (!L || typeof L.close !== 'function' || e.defaultPrevented || !escShown(L.el)) return;
    e.preventDefault(); escShut(L);
}
// The map's own uses of Escape ask this: true only for this very press, when nothing else was open and nothing took the key
function escFree(e) { return !!e && _esc.ev === e && _esc.free === true && !e.defaultPrevented; }
// [floatcheck:esc-end]

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('keydown', escDown, true);
    window.addEventListener('keydown', escBack);
    window.wpEsc = { free: escFree, judge: function(t) { return escJudge(document, window, t || document.activeElement).act; } };
}
