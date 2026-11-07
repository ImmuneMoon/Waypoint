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
function chipGmOnly(doc) { return doc.body && doc.body.classList && doc.body.classList.contains('net-client') ? 'The GM\u2019s' : ''; }   // fold 8: a window only the GM's machine has
var CHIP_WINDOWS = { systemModal: { open: 'systemBtn', tabs: '.sys-tabs button[data-tab]', tabOf: function(el) { var t = el && el.closest ? el.closest('.sys-tab') : null; return t && t.id ? CHIP_TAB_IDS[t.id] || '' : ''; } },
    settingsModal: { open: 'settingsBtn' }, profileModal: { open: 'rowMeBtn' }, netModal: { open: 'netBtn' },
    // fold 5: windows the map and the campaign open, each by its own button; the combat roster only at a table you host
    libraryModal: { open: 'libraryCampBtn' }, objModal: { open: 'addObjectsBtn' }, dicePanel: { open: 'diceBtn' },
    sessionLogModal: { open: 'netLogBtn' },   // fold 6: the Game Record
    sheetPanel: { when: function(doc) { var p = doc.getElementById('sheetPanel'); return p && p.style.display !== 'none' && !(p.classList && p.classList.contains('wp-away')) ? '' : 'With a sheet open'; } },   // fold 6: a sheet's head, with no one button that opens it: lit where a sheet is open
    // fold 7: the Calendar, Sound, Music, Video, the Journal and the table notepad; a control their scripts build as they open is reached by an in: key
    calendarModal: { open: 'clockChip', when: function(doc) { var c = doc.getElementById('clockChip'); return c && !c.hidden && !(c.style && c.style.display === 'none') ? '' : 'With the Calendar on'; } },
    soundPanel: { open: 'soundBtn' }, musicPanel: { open: 'musicBtn' }, videoPanel: { open: 'videoBtn' }, journalModal: { open: 'journalBtn' },
    // fold 8: the Image Library, the Sound Library, which opens from Sound's own Library button (via), and the Time rules panel, which no button opens (go)
    imgLibModal: { open: 'imgLibBtn', when: chipGmOnly }, soundLibModal: { open: 'soundBtn', via: '[data-act="lib"]', when: chipGmOnly },
    timePanel: { go: function() { var tp = typeof window !== 'undefined' ? window.wpTimePanel : null; if (tp && tp.open) tp.open(); }, when: chipGmOnly },
    notepadPanel: { when: function(doc) { var p = doc.getElementById('notepadPanel'); return p && p.style.display !== 'none' && !(p.classList && p.classList.contains('wp-away')) ? '' : 'While the table notepad is up'; } },
    combatModal: { open: 'netCombatBtn', when: function() { var n = typeof window !== 'undefined' ? window.wpNet : null; return n && n.active && n.role === 'host' ? '' : 'While you host'; } } };   // fold 3: Settings, your profile and Multiplayer, which have no tabs: a group of Settings unfolds and a part of Multiplayer opens by its own button
// fold 3: the names Help says them by, marked as Help opens (Help's text stays as written, which many suites read): the part of Help, the name in
// its own words, the control, and where a name stands for something else as well, the one occurrence of it in that part that means the control
var CHIP_NAMES = [
    ['start', 'your profile', '#rowMeBtn'], ['start', 'open your profile', '#setProfileOpenBtn'], ['start', 'start over as a new player', '#profStartOverBtn'], ['start', 'reset multiplayer identity', '#setResetIdentityBtn'],
    ['start', 'save my profile', '#setProfSaveBtn'], ['start', 'copy my profile code', '#setProfCopyBtn'], ['start', 'open a profile', '#setProfOpenBtn'], ['start', 'paste a profile code', '#setProfPasteBtn'], ['start', 'link to my account', '#setAcctLinkBtn'],
    ['start', 'paused', '#pausedPill'], ['start', 'notifications', '#notesBtn'], ['start', 'new campaign', '#newCampBtn'], ['start', 'export this campaign', '#exportCampaignBtn'], ['start', 'share this campaign', '#exportShareBtn'], ['start', 'export everything', '#exportBtn'],
    ['start', 'update now', '#setUpdateNowBtn'], ['start', 'restore the previous version', '#setUpdateRestoreBtn'], ['start', 'snapshot the save now', '#setSnapNowBtn'], ['start', 'get installer', '#setUpdateInstallerBtn'],
    ['whiteboard', 'save as image', '#exportImgBtn'], ['whiteboard', 'lock travel between maps', '#netTravelLockBtn'],
    ['grids', 'game record', '#netLogBtn'], ['grids', 'vtt integration', '#setVttMasterBtn'], ['grids', 'apply to existing campaigns', '#setVttPushBtn'], ['grids', 'grid opacity', '#setGridOpacity'], ['grids', 'toggle pointer location', '#setPointerPosBtn'], ['grids', 'toggle zoom buttons', '#setZoomCtlBtn'],
    ['planners', 'save markdown', '#exportMdBtn'], ['handbook', 'save markdown', '#exportMdBtn'],
    ['mp-gm', 'display name', '#setNameInput'], ['mp-gm', 'host a table', '#netPaneHostBtn'], ['mp-gm', 'start hosting this campaign', '#netHostBtn'], ['mp-gm', 'stream window', '#setStreamBtn'], ['mp-gm', 'game record', '#netLogBtn'],
    ['mp-gm', 'start combat', '#netCombatBtn', 2], ['mp-gm', 'pause the table', '#netPauseBtn'], ['mp-gm', 'firewall-friendly connections', '#setRelayBtn'], ['mp-gm', 'test relay', '#setTurnTestBtn'],
    ['mp-player', 'join a table', '#netPaneJoinBtn'], ['mp-player', 'join', '#netJoinBtn'], ['mp-player', 'table notepad', '#netNotepadBtn'], ['dice', 'table chat', '#chatBtn'], ['keys', 'restore default keys', '#setKeysResetBtn'],
    // fold 4, the map's toolbars: a row of a tool's options, opened by the tool's own small arrow (a name that leads its entry stays as written)
    ['whiteboard', 'clear drawings to show', '#drawShowClear'], ['mp-player', 'clear drawings to show', '#drawShowClear'], ['mp-player', 'ask to put them on the map', '#drawShowAsk'], ['whiteboard', 'trigger zone', '#shapeTriggerBtn'],
    ['whiteboard', 'light and vision on this map', '#fogFoldLight'], ['whiteboard', 'preview a player\u2019s view', '#fogFoldPreview', 1], ['whiteboard', 'this campaign\u2019s fog settings', '#fogFoldCamp'], ['whiteboard', 'light source', '#fogLightPlace'],
    ['whiteboard', 'reveal all', '#fogRevealAll'], ['whiteboard', 'cover all', '#fogCoverAll'], ['whiteboard', 'fit to content', '#wbFitBtn'], ['whiteboard', 'center on character', '#wbCenterCharBtn'], ['keys', 'fit to content', '#wbFitBtn'],
    ['grids', 'cell labels', '#gridLabelsBtn', 2], ['grids', 'clear rulers', '#measureClearBtn'], ['grids', 'explode', '#blastExplodeBtn', 1], ['grids', 'explode', '#blastExplodeBtn', 2], ['grids', 'undo last throw', '#blastUndoThrow'],
    ['sheets', 'explode', '#blastExplodeBtn'], ['sheets', 'undo last throw', '#blastUndoThrow'],
    // fold 5: a button inside a window the map or the campaign opens
    ['whiteboard', 'from a picture', '#objFromPic'], ['whiteboard', 'from another campaign', '#objFromOther', 2], ['sheets', '+ pack', '#libNewPack'], ['sheets', 'import', '#libImport', 1], ['sheets', 'spreadsheet', '#libCsv'],
    ['mp-gm', 'roll all', '#combatRollAllBtn'], ['dice', 'roll', '#diceRollBtn'],
    // fold 6: a sheet's head, and the Game Record
    ['mp-player', 'edit sheet', '#sheetEdit'], ['sheets', 'edit sheet', '#sheetEdit'], ['mp-gm', 'upload', '#sheetUpload'], ['mp-player', 'upload', '#sheetUpload'], ['sheets', 'delete', '#sheetDelete'], ['sheets', 'hide figures', '#sheetHideFig'],
    ['sheets', 'unlock for player', '#sheetUnlock'], ['mp-player', 'done', '#sheetDone'], ['mp-gm', 'done', '#sheetDone', 1], ['mp-gm', 'save as text', '#sessionLogSave'], ['mp-gm', 'delete session', '#sessionLogClear'],
    // fold 7: the Calendar, Sound, Music, Video, the Journal and the table notepad
    ['grids', 'set the clock', 'in:calendarModal.cal-set'], ['grids', 'hide the clock for me', 'in:calendarModal.cal-hideme'], ['whiteboard', 'mute mine', 'in:soundPanel.snd-mute'],
    ['whiteboard', '+ add a sound on an action', 'in:soundPanel.snd-on-add'], ['whiteboard', '+ add music', 'in:musicPanel.music-add'], ['whiteboard', 'auto-play map music while solo', 'in:musicPanel.music-solo-opt'],
    ['whiteboard', 'add videos', 'in:videoPanel.vid-add'], ['mp-player', '+ note', 'in:journalModal.journal-add'], ['mp-player', 'every journal', '#journalAll'],
    ['mp-player', 'save to my journal', '#notepadSaveBtn'], ['mp-player', 'clear', '#notepadClearBtn'],
    // fold 8: the Image Library, the Sound Library and the Time rules panel
    ['whiteboard', 'select', '#imgLibSelectBtn'], ['whiteboard', '+ new tag', 'in:imgLibModal.img-cat-new'], ['whiteboard', 'add to map', '#imgLibPreviewAdd'], ['whiteboard', 'add sounds', '#soundLibUpload'], ['start', 'mute', 'in:timePanel.tp-mute']];
// fold 7: what a chip draws for a control a window's script builds, until that window has been drawn once: its look, whose it is, and what is lit
// in its place where the window shows it only after a pick (near: Set the clock comes once a day is picked, so the row that says so is lit)
var CHIP_STANDS = { 'in:calendarModal.cal-set': { cls: 'tool ghost', gm: true, near: 'cal-pick' }, 'in:calendarModal.cal-hideme': { cls: 'tool ghost', player: true }, 'in:soundPanel.snd-mute': { tick: true },
    'in:soundPanel.snd-on-add': { cls: 'tool ghost snd-btn' }, 'in:musicPanel.music-add': { cls: 'tool ghost' }, 'in:musicPanel.music-solo-opt': { tick: true }, 'in:videoPanel.vid-add': { cls: 'tool' }, 'in:journalModal.journal-add': { cls: 'tool ghost' },
    'in:imgLibModal.img-cat-new': { cls: 'journal-from img-cat-new' }, 'in:timePanel.tp-mute': { cls: 'tp-mute', gm: true, near: 'tp-ch-h' } };   // fold 8: a rule's Mute stands in a character's fold, so a character is lit where none is open
function chipIn(key) { var m = /^in:([A-Za-z][A-Za-z0-9]{0,40})\.([a-z][a-z0-9-]{0,63})$/.exec(typeof key === 'string' ? key : ''); return m ? { win: m[1], cls: m[2] } : null; }
function chipWords(s) { return String(s || '').replace(/\s+/g, ' ').trim().replace(/[.\u2026:]+$/, '').toLowerCase(); }
function chipsName(help) {
    var n = 0;
    CHIP_NAMES.forEach(function(c) {
        var pane = help.querySelector('.help-pane[data-pane="' + c[0] + '"]'); if (!pane) return;
        var bs = pane.querySelectorAll('b'), k = 0;
        for (var i = 0; i < bs.length; i++) { var b = bs[i]; if (b.getAttribute('data-ctl') || b.dataset.name || chipWords(b.textContent) !== c[1]) continue; k++; if (c[3] && k !== c[3]) continue; b.setAttribute('data-ctl', c[2]); n++; }
    });
    return n;
}
// fold 3: a part of a window that shows only at times, and the words a chip says while it does not
var CHIP_WHEN = { netHostInfo: 'While you host', setUpdateRow: 'When an update is found', setRelayBlock: 'With a relay server set', drawShowAsk: 'On a player\u2019s screen', imgLibPreview: 'With a picture picked' };
var CHIP_TAB_IDS = { sysFields: 'fields', sysRolls: 'rolls', sysItems: 'items', sysLists: 'lists', sysEffects: 'effects', sysCombat: 'combat', sysRules: 'rules', sysChars: 'chars', sysLayout: 'layout', sysCalendar: 'calendar' };
var CHIP_KEY = /^(?:sys-tab:[a-z]{1,16}|sys:[a-z]{1,16}:[a-z][a-z0-9-]{0,63}|in:[A-Za-z][A-Za-z0-9]{0,40}\.[a-z][a-z0-9-]{0,63}|#[A-Za-z][A-Za-z0-9_-]{0,63})$/;   // a tab, the first control of a class inside a tab, the first of a class inside a window (fold 7), or a control by its id
// the control a key names in this document, and the window that holds it (none for a control of the page itself)
function chipFind(doc, key) {
    if (typeof key !== 'string' || !CHIP_KEY.test(key)) return null;
    var el = null;
    if (key.indexOf('sys-tab:') === 0) { var tb = key.slice(8), all = doc.querySelectorAll('#systemModal .sys-tabs button[data-tab]'); for (var i = 0; i < all.length; i++) if (all[i].dataset.tab === tb) el = all[i]; }
    else if (key.indexOf('sys:') === 0) { var pp = key.split(':'), tid = ''; for (var k in CHIP_TAB_IDS) if (CHIP_TAB_IDS[k] === pp[1]) tid = k; var tb2 = tid ? doc.getElementById(tid) : null; el = tb2 ? tb2.querySelector('.' + pp[2]) : null; }
    else if (key.indexOf('in:') === 0) { var ip = chipIn(key), bx = ip ? doc.getElementById(ip.win) : null; el = bx ? bx.querySelector('.' + ip.cls) : null; }   // fold 7
    else el = doc.getElementById(key.slice(1));
    if (!el) return null;
    var win = null; for (var w in CHIP_WINDOWS) if (Object.prototype.hasOwnProperty.call(CHIP_WINDOWS, w)) { var box = doc.getElementById(w); if (box && box.contains(el)) win = w; }
    return { el: el, win: win, key: key };
}
// 1.6.2 fold 2, the top row: the menus that hold a control, outermost first, each with the button that opens it (a menu of the row names its button
// by aria-controls; Export As's list has its own); a control the row folded into the » tray is reached by its stand-in there
var CHIP_OPENERS = { saveAsMenu: 'saveAsBtn' };
function chipMenus(doc, el) {
    var out = [];
    for (var n = el && el.parentNode; n && n.getAttribute; n = n.parentNode) {
        var id = n.id; if (!id) continue;
        var op = CHIP_OPENERS[id] ? doc.getElementById(CHIP_OPENERS[id]) : chipOpener(doc, id) || chipBarOpener(n); if (op) out.unshift({ box: n, open: op });
    }
    return out;
}
// the button that opens a part, never a chip's copy of it in Help (fold 3: Join a table is both)
function chipOpener(doc, id) { var all = doc.querySelectorAll('[aria-controls="' + id + '"]'), help = chipHelpBox(doc); for (var i = 0; i < all.length; i++) if (!(help && help.contains(all[i]))) return all[i]; return null; }
function chipShut(box) { return !!box && (box.hidden === true || (box.style && box.style.display === 'none') || (!!box.classList && box.classList.contains('shape-menu') && !box.classList.contains('show'))); }   // fold 4: a tool's options are open while they show
// fold 4: the button that opens a tool's options on the map's toolbars: the small arrow beside it, else the button that only opens a menu
function chipBarOpener(n) {
    if (!n || !n.classList || !n.classList.contains('shape-menu')) return null; var p = n.parentNode; if (!p || !p.classList || !p.classList.contains('tool-pair')) return null;
    var kids = p.children || [], first = null; for (var i = 0; i < kids.length; i++) { var k = kids[i]; if (k === n || !k.classList) continue; if (k.classList.contains('tool-chev')) return k; if (!first && k.tagName === 'BUTTON') first = k; }
    return first;
}
function chipStand(doc, el) {   // what stands for a control: itself, or its button in the tray while the row has folded it away
    if (el && el.classList && el.classList.contains('row-fold') && el.id) { var t = doc.querySelector('#rowTray [data-press="' + el.id + '"]'); if (t) return t; }
    return el;
}
// whether this screen may reach it, and the words where it may not
function chipReach(doc, f) {
    if (!f) return 'Not on this screen';
    if (chipIn(f.key)) return chipReachIn(doc, f.key);   // fold 7
    if (!f.win && f.el.closest && f.el.closest('.gm-only') && doc.body && doc.body.classList && doc.body.classList.contains('net-client')) return 'The GM\u2019s';   // fold 2: a control of the GM's, on a player's app
    var bar = !f.win && f.el.closest ? f.el.closest('.floating-toolbar') : null;   // fold 4: a toolbar of the map, which shows on its own view
    if (bar) {
        if (bar.style && bar.style.display === 'none') return bar.id === 'dataFloatingToolbar' ? 'On the data map' : 'On the play map';
        var chB = chipMenus(doc, f.el), inB = function(x) { return chB.some(function(m) { return m.box === x; }); };
        for (var mi = 0; mi < chB.length; mi++) if ((chB[mi].open.style && chB[mi].open.style.display === 'none') || chB[mi].open.hidden) return 'Not on this screen';
        for (var nb = f.el; nb && nb !== bar; nb = nb.parentNode) { if (inB(nb) || !CHIP_WHEN[nb.id] || !(nb.hidden === true || (nb.style && nb.style.display === 'none'))) continue; return CHIP_WHEN[nb.id]; }   // a part a menu fills as it opens is judged then, so only a part named as shown at times greys a chip
        return '';
    }
    if (!f.win) { var st = chipStand(doc, f.el); return st === f.el && !chipMenus(doc, f.el).length && f.el.offsetParent === null && f.el.style.display === 'none' ? 'Not on this screen' : ''; }
    if (!CHIP_WINDOWS[f.win].open) { var whS = CHIP_WINDOWS[f.win].when ? CHIP_WINDOWS[f.win].when(doc) : 'Not on this screen'; return whS || (f.el.hidden === true || (f.el.style && f.el.style.display === 'none') ? 'Not shown now' : ''); }   // fold 6: a window no one button opens is reached where it is open
    var op = doc.getElementById(CHIP_WINDOWS[f.win].open); if (!op) return 'Not on this screen';
    if (op.style.display === 'none' || op.hidden) return 'The GM’s';
    if (op.closest && op.closest('.gm-only') && doc.body && doc.body.classList && doc.body.classList.contains('net-client')) return 'The GM\u2019s';   // fold 5: a window a GM's button opens, on a player's app
    var wh = typeof CHIP_WINDOWS[f.win].when === 'function' ? CHIP_WINDOWS[f.win].when(doc) : ''; if (wh) return wh;   // fold 5: a window that opens only at times
    if (CHIP_WINDOWS[f.win].tabs) return '';   // a window with tabs opens the control's tab (chipGo)
    var box = doc.getElementById(f.win);   // fold 3: a part of the window put away until it applies, which no button of the window opens
    for (var n = f.el.parentNode; n && n !== box; n = n.parentNode) { if (!n.id || !n.style || n.style.display !== 'none') continue; if (chipOpener(doc, n.id)) continue; return CHIP_WHEN[n.id] || 'Not shown now'; }
    return '';
}
// fold 7: a control a window's script builds is judged by its window and by whose it is, drawn yet or not
function chipReachIn(doc, key) {
    var ip = chipIn(key), cw = ip && Object.prototype.hasOwnProperty.call(CHIP_WINDOWS, ip.win) ? CHIP_WINDOWS[ip.win] : null, rec = Object.prototype.hasOwnProperty.call(CHIP_STANDS, key) ? CHIP_STANDS[key] : {};
    var cl = !!(doc.body && doc.body.classList && doc.body.classList.contains('net-client'));
    if (!cw || !doc.getElementById(ip.win)) return 'Not on this screen';
    if (rec.gm && cl) return 'The GM\u2019s'; if (rec.player && !cl) return 'On a player\u2019s screen';
    if (typeof cw.when === 'function') { var w = cw.when(doc); if (w) return w; }
    if (!cw.open) return '';
    var op = doc.getElementById(cw.open); if (!op) return 'Not on this screen';
    if (cl && op.closest && op.closest('.gm-only')) return 'The GM\u2019s';
    var bar = op.closest ? op.closest('.floating-toolbar') : null; if (bar && bar.style && bar.style.display === 'none') return bar.id === 'dataFloatingToolbar' ? 'On the data map' : 'On the play map';
    if (!bar && (op.hidden === true || (op.style && op.style.display === 'none'))) return 'Not on this screen';
    return '';
}
// fold 7: what stands for such a control until its window is drawn: a button or a tick in the control's own classes, with Help's words for it
function chipStandIn(doc, key, words) {
    var rec = Object.prototype.hasOwnProperty.call(CHIP_STANDS, key) ? CHIP_STANDS[key] : {}, wrap = doc.createElement('span'), c;
    wrap.className = 'help-chip-in';
    if (rec.tick) { c = doc.createElement('label'); var t = doc.createElement('input'); t.type = 'checkbox'; t.setAttribute('tabindex', '-1'); c.appendChild(t); var s = doc.createElement('span'); s.textContent = ' ' + words; c.appendChild(s); }
    else { c = doc.createElement('button'); c.type = 'button'; c.className = rec.cls || 'tool'; c.textContent = words; }
    c.setAttribute('tabindex', '-1'); c.setAttribute('aria-hidden', 'true'); wrap.appendChild(c);
    return wrap;
}
// fold 3: the closed groups of Settings around a control, outermost first
function chipFolds(el, box) { var out = []; for (var n = el && el.parentNode; n && n !== box; n = n.parentNode) if (n.tagName === 'DETAILS' && !n.open) out.unshift(n); return out; }
// the copy a chip shows: the control's own element with its words and its drawing, made inert (no id, no handler, no focus of its own), inside the
// classes of the control's parent, so the style sheet draws it as in the app
function chipCopy(doc, el) {
    var c = el.cloneNode(true); c.removeAttribute('id'); c.removeAttribute('title'); c.removeAttribute('data-tip'); c.removeAttribute('disabled'); c.setAttribute('tabindex', '-1'); c.setAttribute('aria-hidden', 'true');
    c.removeAttribute('aria-controls'); c.removeAttribute('aria-expanded');   // fold 3: a copy opens nothing and is found by nothing
    c.removeAttribute('hidden'); if (c.style && c.style.display === 'none') c.style.display = '';   // a control shown at times (the Paused pill, Restore) is drawn as it looks when shown, never 4 px of nothing
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
    chipsName(help);   // fold 3
    var marks = help.querySelectorAll('b[data-ctl]');
    for (var i = 0; i < marks.length; i++) {
        var b = marks[i], key = b.getAttribute('data-ctl'), f = chipFind(doc, key), ipD = chipIn(key);
        if (!f && ipD && Object.prototype.hasOwnProperty.call(CHIP_STANDS, key) && doc.getElementById(ipD.win)) f = { el: null, win: ipD.win, key: key };   // fold 7: its window has not been drawn yet
        if (!f) continue;
        if (!b.dataset.name) b.dataset.name = String(b.textContent || '').replace(/\s+/g, ' ').trim();   // Help's own words for it, kept before the chip takes their place
        var chip = b.querySelector('.help-chip');
        if (!chip) { chip = doc.createElement('span'); chip.className = 'help-chip'; chip.setAttribute('role', 'button'); chip.dataset.ctl = key; b.textContent = ''; b.appendChild(chip); }
        var srcE = f.el && f.el.tagName === 'INPUT' && f.el.parentNode && f.el.parentNode.tagName === 'LABEL' ? f.el.parentNode : f.el;   // fold 7: a tick is drawn with its words, its label
        chip.textContent = ''; chip.appendChild(srcE ? chipCopy(doc, srcE) : chipStandIn(doc, key, b.dataset.name));
        var why = chipReach(doc, f); chip.classList.toggle('help-chip-off', !!why); chip.setAttribute('tabindex', why ? '-1' : '0'); chip.setAttribute('aria-disabled', why ? 'true' : 'false');
        var words = (b.dataset.name || (f.el ? f.el.textContent || '' : '').replace(/\s+/g, ' ').trim() || String(f.el ? f.el.getAttribute('title') || '' : '').split('.')[0].trim()).replace(/[.\u2026:]+$/, ''); chip.setAttribute('aria-label', words); chip.dataset.tip = why ? words + '. ' + why + '.' : 'Show me ' + words + '.';   // fold 2: an icon alone says itself by its tooltip   // a chip says itself in Help's words (a menu row's own may hold more, such as how many kinds it lists), never ending in two stops
        n++;
    }
    return n;
}
// the part of Help on screen: the first pane not put away
function chipPaneOn(help) { var ps = help ? help.querySelectorAll('.help-pane') : []; for (var i = 0; i < ps.length; i++) if (ps[i].style.display !== 'none') return ps[i]; return null; }
// press: Help aside, the window open on its tab, the control in view and lit; then Back to Help
function chipGo(doc, key) {
    var ipG = chipIn(key); if (ipG) return chipReachIn(doc, key) ? false : chipGoIn(doc, key, ipG);   // fold 7
    var f = chipFind(doc, key); if (!f || chipReach(doc, f)) return false;
    var help = chipHelpBox(doc), pane = chipPaneOn(help), body = pane ? pane.parentNode : null;
    _chipBack = { pane: pane ? pane.dataset.pane : '', top: body ? body.scrollTop : 0 };
    if (help) help.style.display = 'none';
    if (f.win && !CHIP_WINDOWS[f.win].tabs) {   // fold 3: a window with no tabs opens now, and a moment after, its group or its part, and the control is lit
        var boxW = doc.getElementById(f.win), cwW = CHIP_WINDOWS[f.win];
        if (boxW && boxW.style.display === 'none') { var vW = cwW.via ? doc.querySelector(cwW.via) : null; if (!vW) { var opW = doc.getElementById(cwW.open); if (opW) opW.click(); vW = cwW.via ? doc.querySelector(cwW.via) : null; } if (vW && vW.click) vW.click(); }   // fold 8: a window opened by a button of another, which is pressed first only where it is not drawn yet
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
// fold 7: open the window by its own button, unless it is up, and light the control once its script has drawn it (a journal reads its index first)
function chipGoIn(doc, key, ip) {
    var help = chipHelpBox(doc), pane = chipPaneOn(help), body = pane ? pane.parentNode : null;
    _chipBack = { pane: pane ? pane.dataset.pane : '', top: body ? body.scrollTop : 0 };
    if (help) help.style.display = 'none';
    var box = doc.getElementById(ip.win), cw = CHIP_WINDOWS[ip.win], fl = typeof window !== 'undefined' ? window.wpFloats : null;
    var up = !!box && (fl && typeof fl.shown === 'function' ? fl.shown(box) : box.style.display !== 'none' && !(box.classList && box.classList.contains('wp-away')));
    if (!up && typeof cw.go === 'function') cw.go(doc); else if (!up && cw.open) { var op = doc.getElementById(cw.open); if (op && op.click) op.click(); }   // fold 8: a window no button opens has its own way (go)
    chipBackShow(doc);
    var rec = Object.prototype.hasOwnProperty.call(CHIP_STANDS, key) ? CHIP_STANDS[key] : {};
    var tries = 0, look = function() { var f = chipFind(doc, key), nr = !f && rec.near && tries >= 5 && box ? box.querySelector('.' + rec.near) : null; if (!f && !nr) { if (++tries < 20) setTimeout(look, 100); return; } var el = f ? f.el : nr; if (el.scrollIntoView) el.scrollIntoView({ block: 'center' }); el.classList.add('help-found'); setTimeout(function() { el.classList.remove('help-found'); }, 2000); };
    setTimeout(look, 0);
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
